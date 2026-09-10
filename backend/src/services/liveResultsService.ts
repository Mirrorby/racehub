import type { Env } from "../env";
import { getOrRefresh } from "../lib/cache";
import * as openf1 from "../providers/openf1";
import { getDriverStandings, getConstructorStandings } from "../providers/jolpica";
import type { RaceResultEntry, RaceWeekend, SessionType, Standing } from "../types";

// Данные OpenF1 сами по себе появляются быстро (минуты после гонки), но
// мы всё равно кэшируем на пару минут, чтобы не дёргать апстрим на
// каждый заход в мини-апп — это не про свежесть, а про вежливость к API.
const FAST_PATH_TTL_SECONDS = 2 * 60;
// Сопоставление season/round -> OpenF1 session_key не меняется после того,
// как сессия состоялась, поэтому кэшируем его надолго.
const SESSION_LOOKUP_TTL_SECONDS = 6 * 60 * 60;

// Наш внутренний SessionType -> имя сессии в терминах OpenF1 (`session_name`).
const OPENF1_SESSION_NAME: Record<SessionType, Parameters<typeof openf1.findSession>[1]> = {
  fp1: "Practice 1",
  fp2: "Practice 2",
  fp3: "Practice 3",
  sprint_quali: "Sprint Qualifying",
  sprint: "Sprint",
  qualifying: "Qualifying",
  race: "Race",
};

export async function findSessionCached(
  env: Env,
  weekend: RaceWeekend,
  sessionType: SessionType,
): Promise<openf1.RawOpenF1Session | null> {
  const session = weekend.sessions.find((s) => s.type === sessionType);
  if (!session) return null;

  const openf1Name = OPENF1_SESSION_NAME[sessionType];
  const cacheKey = `openf1:session:${weekend.id}:${sessionType}`;
  const cached = await env.DB.prepare("SELECT payload, expires_at FROM api_cache WHERE cache_key = ?")
    .bind(cacheKey)
    .first<{ payload: string; expires_at: string }>();
  if (cached && new Date(cached.expires_at) > new Date()) {
    return JSON.parse(cached.payload) as openf1.RawOpenF1Session;
  }

  const found = await openf1.findSession(weekend.season, openf1Name, session.startUtc);
  // Кэшируем надолго только удачный результат — session_key стабилен раз
  // найден. "Не нашли" НЕ кэшируем: если закэшировать null на 6 часов, а
  // OpenF1 создаст сессию чуть позже (граничный случай на самом первом
  // этапе нового сезона), мы застряли бы с фолбэком на Jolpica впустую
  // весь этот срок вместо того, чтобы просто повторить попытку на
  // следующий запрос.
  if (found) {
    const now = new Date();
    const expiresIso = new Date(now.getTime() + SESSION_LOOKUP_TTL_SECONDS * 1000).toISOString();
    await env.DB.prepare(
      `INSERT INTO api_cache (cache_key, payload, fetched_at, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`,
    )
      .bind(cacheKey, JSON.stringify(found), now.toISOString(), expiresIso)
      .run();
  }
  return found;
}

interface DriverIndexEntry {
  id: string;
  fullName: string;
}

/** code (VER/HAM/...) -> {id, fullName} из уже закэшированных Jolpica-standings. */
export async function buildDriverCodeIndex(env: Env): Promise<Map<string, DriverIndexEntry>> {
  const { standings } = await getOrRefresh(env, "standings:drivers", 15 * 60, getDriverStandings);
  const index = new Map<string, DriverIndexEntry>();
  for (const entry of standings) {
    const code = entry.Driver.code ?? entry.Driver.driverId.slice(0, 3).toUpperCase();
    index.set(code, { id: entry.Driver.driverId, fullName: `${entry.Driver.givenName} ${entry.Driver.familyName}` });
  }
  return index;
}

interface ConstructorIndexEntry {
  id: string;
  name: string;
}

export function normalizeTeamName(name: string): string {
  return name.trim().toLowerCase();
}

/** normalized team name -> {id, name} из уже закэшированных Jolpica-standings. */
export async function buildConstructorNameIndex(env: Env): Promise<Map<string, ConstructorIndexEntry>> {
  const { standings } = await getOrRefresh(env, "standings:constructors", 15 * 60, getConstructorStandings);
  const index = new Map<string, ConstructorIndexEntry>();
  for (const entry of standings) {
    index.set(normalizeTeamName(entry.Constructor.name), { id: entry.Constructor.constructorId, name: entry.Constructor.name });
  }
  return index;
}

function resultStatus(row: openf1.RawOpenF1SessionResult): string {
  if (row.dsq) return "Disqualified";
  if (row.dns) return "Did not start";
  if (row.dnf) return "Retired";
  return "Finished";
}

function positionText(row: openf1.RawOpenF1SessionResult): string {
  if (row.dsq) return "D";
  if (row.dns) return "W";
  if (row.dnf) return "R";
  return row.position != null ? String(row.position) : "—";
}

// DSQ/DNS у OpenF1 приходят с position: null (см. тесты в docs.rs/crate/openf1
// — я изначально не учёл это в типе RawOpenF1SessionResult, поэтому текущий
// прод, скорее всего, писал `NaN` в отсортированный список при дисквалификации
// — сортировка `.sort((a,b) => a.position - b.position)` с NaN даёт
// непредсказуемый порядок, но не падает. Не баг именно этого PR, но раз уж
// делаю тип точным — заодно чиню и сортировку: диски/неявки уходят в конец.
const UNRANKED_SORT_POSITION = 9999;

function sortablePosition(row: openf1.RawOpenF1SessionResult): number {
  return row.position ?? UNRANKED_SORT_POSITION;
}

/**
 * Быстрые результаты гонки через OpenF1. Возвращает null (а не пустой
 * массив), если OpenF1 ещё не знает об этой сессии или результатов нет —
 * вызывающий код должен в этом случае откатиться на Jolpica.
 *
 * Квалификацию сознательно не переводим на этот путь: у OpenF1 нет
 * готового Q1/Q2/Q3 разбиения как у Ergast, а собирать его из сырых
 * `laps` — отдельная по объёму задача, не относящаяся к исходной жалобе
 * (результаты именно гонки приходили на несколько часов позже, чем хотелось).
 */
export async function getFastRaceResults(env: Env, weekend: RaceWeekend): Promise<RaceResultEntry[] | null> {
  const session = await findSessionCached(env, weekend, "race");
  if (!session) return null;

  return getOrRefresh(env, `openf1:results:${weekend.id}`, FAST_PATH_TTL_SECONDS, async () => {
    const [results, drivers, grid] = await Promise.all([
      openf1.getSessionResult(session.session_key),
      openf1.getSessionDrivers(session.session_key),
      openf1.getStartingGrid(session.session_key).catch(() => [] as openf1.RawOpenF1StartingGridEntry[]),
    ]);
    if (results.length === 0) return null;

    const [driverCodeIndex, constructorNameIndex] = await Promise.all([
      buildDriverCodeIndex(env),
      buildConstructorNameIndex(env),
    ]);

    const driversByNumber = new Map(drivers.map((d) => [d.driver_number, d]));
    const gridByNumber = new Map(grid.map((g) => [g.driver_number, g.position]));

    const entries: RaceResultEntry[] = results
      .filter((row) => driversByNumber.has(row.driver_number))
      .map((row) => {
        const driverMeta = driversByNumber.get(row.driver_number)!;
        // Сведение по 3-буквенному коду — он общий для OpenF1 и Ergast/
        // Jolpica (присваивается FIA один раз на карьеру пилота). Если
        // сведение не удалось (совсем новый пилот, ещё не попавший в
        // закэшированные Jolpica-standings) — не роняем всю гонку, а
        // показываем данные под "сырым" id из OpenF1.
        const driver = driverCodeIndex.get(driverMeta.name_acronym) ?? {
          id: `openf1-${row.driver_number}`,
          fullName: driverMeta.full_name,
        };
        const constructor = constructorNameIndex.get(normalizeTeamName(driverMeta.team_name)) ?? {
          id: normalizeTeamName(driverMeta.team_name).replace(/\s+/g, "_"),
          name: driverMeta.team_name,
        };

        return {
          position: sortablePosition(row),
          positionText: positionText(row),
          driver: { id: driver.id, code: driverMeta.name_acronym, fullName: driver.fullName },
          constructor,
          grid: gridByNumber.get(row.driver_number) ?? 0,
          laps: row.number_of_laps ?? 0,
          status: resultStatus(row),
          points: row.points,
        };
      })
      .sort((a, b) => a.position - b.position);

    return entries.length > 0 ? entries : null;
  });
}

/** Быстрый личный зачёт через OpenF1 championship_drivers, снятый сразу после последней прошедшей гонки. */
export async function getFastDriverStandings(env: Env, latestRace: RaceWeekend): Promise<Standing[] | null> {
  const session = await findSessionCached(env, latestRace, "race");
  if (!session) return null;

  return getOrRefresh(env, `openf1:standings:drivers:${latestRace.id}`, FAST_PATH_TTL_SECONDS, async () => {
    const [championship, drivers] = await Promise.all([
      openf1.getChampionshipDrivers(session.session_key),
      openf1.getSessionDrivers(session.session_key),
    ]);
    if (championship.length === 0) return null;

    const [driverCodeIndex, constructorNameIndex] = await Promise.all([
      buildDriverCodeIndex(env),
      buildConstructorNameIndex(env),
    ]);
    const driversByNumber = new Map(drivers.map((d) => [d.driver_number, d]));

    const sorted = [...championship].sort((a, b) => a.position_current - b.position_current);
    const leaderPoints = sorted[0]?.points_current ?? 0;

    const result: Standing[] = sorted
      .filter((row) => driversByNumber.has(row.driver_number))
      .map((row) => {
        const driverMeta = driversByNumber.get(row.driver_number)!;
        const driver = driverCodeIndex.get(driverMeta.name_acronym) ?? {
          id: `openf1-${row.driver_number}`,
          fullName: driverMeta.full_name,
        };
        // Раньше здесь constructor всегда был undefined, а teamColor не
        // проставлялся вовсе — тема команды на карточке пилота молча
        // ломалась всякий раз, когда активировался этот быстрый путь.
        // Здесь же лежит team_colour от OpenF1, поэтому заодно используем
        // его как основной источник цвета вместо статичной таблицы.
        const color = `#${driverMeta.team_colour}`;
        const constructorMeta = constructorNameIndex.get(normalizeTeamName(driverMeta.team_name)) ?? {
          id: normalizeTeamName(driverMeta.team_name).replace(/\s+/g, "_"),
          name: driverMeta.team_name,
        };
        return {
          position: row.position_current,
          points: row.points_current,
          wins: 0, // OpenF1 championship_drivers не отдаёт число побед отдельно
          gapToLeader: row.points_current === leaderPoints ? 0 : leaderPoints - row.points_current,
          movement: "unknown" as const,
          driver: { id: driver.id, code: driverMeta.name_acronym, fullName: driver.fullName, teamColor: color },
          constructor: { id: constructorMeta.id, name: constructorMeta.name, color },
        };
      });

    return result.length > 0 ? result : null;
  });
}

/** Быстрый кубок конструкторов через OpenF1 championship_teams. */
export async function getFastConstructorStandings(env: Env, latestRace: RaceWeekend): Promise<Standing[] | null> {
  const session = await findSessionCached(env, latestRace, "race");
  if (!session) return null;

  return getOrRefresh(env, `openf1:standings:constructors:${latestRace.id}`, FAST_PATH_TTL_SECONDS, async () => {
    const [championship, drivers] = await Promise.all([
      openf1.getChampionshipTeams(session.session_key),
      openf1.getSessionDrivers(session.session_key),
    ]);
    if (championship.length === 0) return null;

    const constructorNameIndex = await buildConstructorNameIndex(env);
    // championship_teams не содержит team_colour — берём его с любого
    // пилота этой же команды из уже загруженного списка drivers сессии.
    const colorByTeamName = new Map<string, string>();
    for (const d of drivers) {
      const key = normalizeTeamName(d.team_name);
      if (!colorByTeamName.has(key)) colorByTeamName.set(key, `#${d.team_colour}`);
    }

    const sorted = [...championship].sort((a, b) => a.position_current - b.position_current);
    const leaderPoints = sorted[0]?.points_current ?? 0;

    const result: Standing[] = sorted.map((row) => {
      const key = normalizeTeamName(row.team_name);
      const constructor = constructorNameIndex.get(key) ?? {
        id: key.replace(/\s+/g, "_"),
        name: row.team_name,
      };
      return {
        position: row.position_current,
        points: row.points_current,
        wins: 0,
        gapToLeader: row.points_current === leaderPoints ? 0 : leaderPoints - row.points_current,
        movement: "unknown" as const,
        constructor: { ...constructor, color: colorByTeamName.get(key) },
      };
    });

    return result.length > 0 ? result : null;
  });
}

const TEAM_COLOR_TTL_SECONDS = 6 * 60 * 60;

/**
 * constructorId -> "#RRGGBB" из официального team_colour OpenF1, снятого с
 * самой недавней прошедшей сессии сезона. Используется как основной
 * источник цвета команды вместо статичной таблицы mappers/teamColors.ts —
 * не требует ручного обновления по межсезоньям/ребрендингам. Возвращает
 * пустую карту (не ошибку), если OpenF1 недоступен или сессию ещё не
 * нашли — вызывающий код должен в этом случае просто откатиться на
 * статичную таблицу для тех constructorId, которых нет в карте.
 */
export async function getLiveTeamColors(env: Env, latestRace: RaceWeekend | null): Promise<Map<string, string>> {
  if (!latestRace) return new Map();
  const session = await findSessionCached(env, latestRace, "race");
  if (!session) return new Map();

  // getOrRefresh кэширует через JSON.stringify — Map через него сериализуется
  // в "{}" (теряет все данные) и на втором запросе (cache hit) молча вернула
  // бы пустой объект вместо Map, а любой .get() на нём уронил бы весь запрос
  // рантайм-ошибкой. Поэтому кэшируем как обычный Record, а Map собираем
  // уже на выходе из функции.
  const plain = await getOrRefresh(env, `openf1:team-colors:${latestRace.id}`, TEAM_COLOR_TTL_SECONDS, async () => {
    const [drivers, constructorNameIndex] = await Promise.all([
      openf1.getSessionDrivers(session.session_key),
      buildConstructorNameIndex(env),
    ]);
    const record: Record<string, string> = {};
    for (const d of drivers) {
      const constructor = constructorNameIndex.get(normalizeTeamName(d.team_name));
      if (constructor && !(constructor.id in record)) {
        record[constructor.id] = `#${d.team_colour}`;
      }
    }
    return record;
  });

  return new Map(Object.entries(plain));
}
