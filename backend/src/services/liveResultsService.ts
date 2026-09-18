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

/** driverId -> число побед в сезоне из Jolpica-standings. См. комментарий у getFastDriverStandings — OpenF1 не отдаёт эту цифру отдельно. */
export async function buildDriverWinsIndex(env: Env): Promise<Map<string, number>> {
  const { standings } = await getOrRefresh(env, "standings:drivers", 15 * 60, getDriverStandings);
  const index = new Map<string, number>();
  for (const entry of standings) {
    index.set(entry.Driver.driverId, Number(entry.wins));
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

/**
 * driverCode (3-буквенный FIA-код, как в OpenF1 name_acronym) -> его
 * текущая команда по Jolpica-standings. Строится из ТОГО ЖЕ Jolpica-
 * запроса, что и buildDriverCodeIndex (getOrRefresh с тем же ключом
 * "standings:drivers" — при попадании в кэш это не дополнительный запрос).
 *
 * ЗАМЕНЯЕТ собой прежний buildConstructorNameIndex + normalizeTeamName-
 * сравнение team_name (OpenF1) с Constructor.name (Jolpica) напрямую как
 * строк. Тот подход ломался, когда две системы называют одну и ту же
 * команду по-разному (сокращения/спонсорские приставки/ребрендинг) — по
 * факту это подтвердилось 16.09.2026 при аудите: 4 из 11 команд не
 * сводились (`team_colors` в проде содержал только 7 строк из 11).
 * Сведение по коду пилота надёжнее в принципе: код общий для обеих
 * систем и назначается FIA один раз на карьеру пилота, а не каждый сезон
 * заново под конкретное название команды.
 */
export async function buildDriverConstructorIndex(env: Env): Promise<Map<string, ConstructorIndexEntry>> {
  const { standings } = await getOrRefresh(env, "standings:drivers", 15 * 60, getDriverStandings);
  const index = new Map<string, ConstructorIndexEntry>();
  for (const entry of standings) {
    const code = entry.Driver.code ?? entry.Driver.driverId.slice(0, 3).toUpperCase();
    const constructor = entry.Constructors[entry.Constructors.length - 1];
    if (constructor) {
      index.set(code, { id: constructor.constructorId, name: constructor.name });
    }
  }
  return index;
}

/** constructorId -> число побед в сезоне из Jolpica-standings. Тот же приём, что buildDriverWinsIndex — OpenF1 championship_teams этой цифры не отдаёт. */
export async function buildConstructorWinsIndex(env: Env): Promise<Map<string, number>> {
  const { standings } = await getOrRefresh(env, "standings:constructors", 15 * 60, getConstructorStandings);
  const index = new Map<string, number>();
  for (const entry of standings) {
    index.set(entry.Constructor.constructorId, Number(entry.wins));
  }
  return index;
}

export function resultStatus(row: openf1.RawOpenF1SessionResult): string {
  if (row.dsq) return "Disqualified";
  if (row.dns) return "Did not start";
  if (row.dnf) return "Retired";
  return "Finished";
}

export function positionText(row: openf1.RawOpenF1SessionResult): string {
  if (row.dsq) return "D";
  if (row.dns) return "W";
  if (row.dnf) return "R";
  return row.position != null ? String(row.position) : "—";
}

// Сортировочный ключ ТОЛЬКО для упорядочивания списка — раньше это же
// значение (9999-sentinel для DSQ/DNS) писалось прямо в поле `position`
// отдаваемой сущности, то есть утекало наружу в API как якобы реальная
// позиция гонщика. Теперь sortablePosition используется исключительно
// для .sort() ДО сборки итоговых записей — см. getFastRaceResults и
// practiceResultsService.ts::getSprintQualifyingResults, где `position`
// в самой записи теперь либо настоящий OpenF1 position, либо
// последовательный номер по итоговому порядку (та же семантика, что у
// Ergast/Jolpica, см. mappers/raceResults.ts). Обнаружено и исправлено
// 16.09.2026 при аудите — до этого сентинел 9999 был виден в ответе API
// для любого потребителя, который не подстраховался и использовал
// `position` вместо `positionText`.
const UNRANKED_SORT_POSITION = 9999;

export function sortablePosition(row: openf1.RawOpenF1SessionResult): number {
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

    const [driverCodeIndex, driverConstructorIndex] = await Promise.all([
      buildDriverCodeIndex(env),
      buildDriverConstructorIndex(env),
    ]);

    const driversByNumber = new Map(drivers.map((d) => [d.driver_number, d]));
    const gridByNumber = new Map(grid.map((g) => [g.driver_number, g.position]));

    const entries: RaceResultEntry[] = results
      .filter((row) => driversByNumber.has(row.driver_number))
      .sort((a, b) => sortablePosition(a) - sortablePosition(b))
      .map((row, index) => {
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
        // Команда — тоже через код пилота (driverConstructorIndex), не
        // через сравнение team_name/Constructor.name как строк.
        const constructor = driverConstructorIndex.get(driverMeta.name_acronym) ?? {
          id: normalizeTeamName(driverMeta.team_name).replace(/\s+/g, "_"),
          name: driverMeta.team_name,
        };

        return {
          // Настоящий OpenF1 position, когда есть; для DSQ/DNS (position
          // null) — последовательный номер по итоговому порядку, та же
          // семантика, что у Ergast/Jolpica (см. mappers/raceResults.ts),
          // а не технический sentinel.
          position: row.position ?? index + 1,
          positionText: positionText(row),
          driver: { id: driver.id, code: driverMeta.name_acronym, fullName: driver.fullName },
          constructor,
          grid: gridByNumber.get(row.driver_number) ?? 0,
          laps: row.number_of_laps ?? 0,
          status: resultStatus(row),
          points: row.points,
        };
      });

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

    const [driverCodeIndex, driverConstructorIndex, winsByDriverId] = await Promise.all([
      buildDriverCodeIndex(env),
      buildDriverConstructorIndex(env),
      // OpenF1 championship_drivers не отдаёт число побед отдельно — берём
      // его из уже закэшированных (15 мин TTL) Jolpica-standings. Может на
      // одну гонку отставать от реальности в первые минуты после финиша
      // (пока Jolpica не обновился), но это всё равно точнее, чем
      // захардкоженный 0 для каждого пилота, который был здесь раньше.
      buildDriverWinsIndex(env),
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
        // Команда — через код пилота, не через сравнение имён (см.
        // buildDriverConstructorIndex).
        const constructorMeta = driverConstructorIndex.get(driverMeta.name_acronym) ?? {
          id: normalizeTeamName(driverMeta.team_name).replace(/\s+/g, "_"),
          name: driverMeta.team_name,
        };
        return {
          position: row.position_current,
          points: row.points_current,
          wins: winsByDriverId.get(driver.id) ?? 0,
          gapToLeader: row.points_current === leaderPoints ? 0 : leaderPoints - row.points_current,
          movement: "unknown" as const,
          // ВАЖНО: number/constructorId/constructorName у Standing.driver
          // объявлены как Partial (см. types.ts) — то есть отсутствие
          // этих полей НЕ ловится компилятором, а тихо рендерится как
          // пустая строка/прочерк на фронте (Team/Number в General
          // Information). Раньше их здесь не было вовсе — баг был не
          // виден на tsc, только глазами на реальном экране.
          driver: {
            id: driver.id,
            code: driverMeta.name_acronym,
            fullName: driver.fullName,
            number: row.driver_number,
            constructorId: constructorMeta.id,
            constructorName: constructorMeta.name,
            teamColor: color,
            headshotUrl: driverMeta.headshot_url ?? null,
          },
          constructor: { id: constructorMeta.id, name: constructorMeta.name, color },
        };
      });

    return result.length > 0 ? result : null;
  });
}

/**
 * Быстрый кубок конструкторов через OpenF1.
 *
 * НЕ использует championship_teams: тот эндпоинт даёт team_name без
 * driver_number, и единственный способ связать его с constructorId был —
 * сравнить team_name с тем, что в /drivers той же сессии. Оказалось, что
 * это сравнение ломается даже когда ОБЕ стороны — от OpenF1: сам OpenF1
 * не гарантирует одинаковое написание team_name в разных своих
 * эндпоинтах (подтверждено 17.09.2026 в проде: даже после перехода на
 * сведение по коду пилота constructor_career продолжал получать "rb"/
 * "red_bull" вместо канонических "racing_bulls"/"red_bull_racing" — то
 * есть сам синтетический fallback по team_name срабатывал, значит
 * team_name у championship_teams и у drivers для одной и той же команды
 * не совпадали). championship_drivers, в отличие от championship_teams,
 * содержит driver_number — конструкторские очки просто суммируются по
 * пилотам одной команды, определённой через driverConstructorIndex (код
 * пилота), без единого сравнения строк.
 */
export async function getFastConstructorStandings(env: Env, latestRace: RaceWeekend): Promise<Standing[] | null> {
  const session = await findSessionCached(env, latestRace, "race");
  if (!session) return null;

  return getOrRefresh(env, `openf1:standings:constructors:${latestRace.id}`, FAST_PATH_TTL_SECONDS, async () => {
    const [driversChampionship, drivers] = await Promise.all([
      openf1.getChampionshipDrivers(session.session_key),
      openf1.getSessionDrivers(session.session_key),
    ]);
    if (driversChampionship.length === 0) return null;

    const [driverConstructorIndex, winsByConstructorId] = await Promise.all([
      buildDriverConstructorIndex(env),
      buildConstructorWinsIndex(env),
    ]);
    const driversByNumber = new Map(drivers.map((d) => [d.driver_number, d]));

    interface Aggregate {
      constructor: ConstructorIndexEntry;
      points: number;
      color: string;
    }
    const byConstructorId = new Map<string, Aggregate>();

    for (const row of driversChampionship) {
      const driverMeta = driversByNumber.get(row.driver_number);
      if (!driverMeta) continue;
      const constructor = driverConstructorIndex.get(driverMeta.name_acronym);
      if (!constructor) continue; // не удалось свести пилота — пропускаем, не гадаем с fallback-id

      const existing = byConstructorId.get(constructor.id);
      if (existing) {
        existing.points += row.points_current;
      } else {
        byConstructorId.set(constructor.id, { constructor, points: row.points_current, color: `#${driverMeta.team_colour}` });
      }
    }

    const sorted = [...byConstructorId.values()].sort((a, b) => b.points - a.points);
    const leaderPoints = sorted[0]?.points ?? 0;

    const result: Standing[] = sorted.map((entry, index) => ({
      position: index + 1,
      points: entry.points,
      wins: winsByConstructorId.get(entry.constructor.id) ?? 0,
      gapToLeader: entry.points === leaderPoints ? 0 : leaderPoints - entry.points,
      movement: "unknown" as const,
      constructor: { ...entry.constructor, color: entry.color },
    }));

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
    const [drivers, driverConstructorIndex] = await Promise.all([
      openf1.getSessionDrivers(session.session_key),
      buildDriverConstructorIndex(env),
    ]);
    const record: Record<string, string> = {};
    for (const d of drivers) {
      const constructor = driverConstructorIndex.get(d.name_acronym);
      if (constructor && !(constructor.id in record)) {
        record[constructor.id] = `#${d.team_colour}`;
      }
    }
    return record;
  });

  return new Map(Object.entries(plain));
}

// Фото пилотов не меняются практически никогда (разве что смена состава
// команды в межсезонье/midseason) — TTL с большим запасом.
const HEADSHOT_TTL_SECONDS = 24 * 60 * 60;

/**
 * driverId -> headshot_url (официальное фото с формы Formula1.com,
 * OpenF1 отдаёт прямую ссылку на CDN — см. providers/openf1.ts). Jolpica
 * медиа не отдаёт вообще, это единственный источник фото через API.
 * Тот же паттерн, что getLiveTeamColors: сессия по последней стартовавшей
 * гонке + сопоставление по 3-буквенному коду (name_acronym == Driver.code).
 */
export async function getLiveDriverMedia(env: Env, latestRace: RaceWeekend | null): Promise<Map<string, string>> {
  if (!latestRace) return new Map();
  const session = await findSessionCached(env, latestRace, "race");
  if (!session) return new Map();

  const plain = await getOrRefresh(env, `openf1:driver-media:${latestRace.id}`, HEADSHOT_TTL_SECONDS, async () => {
    const [drivers, driverCodeIndex] = await Promise.all([openf1.getSessionDrivers(session.session_key), buildDriverCodeIndex(env)]);
    const record: Record<string, string> = {};
    for (const d of drivers) {
      if (!d.headshot_url) continue; // OpenF1 честно отдаёт null, если фото нет — не выдумываем
      const driver = driverCodeIndex.get(d.name_acronym);
      if (driver) record[driver.id] = d.headshot_url;
    }
    return record;
  });

  return new Map(Object.entries(plain));
}
