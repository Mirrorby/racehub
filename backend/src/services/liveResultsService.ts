import type { Env } from "../env";
import { getOrRefresh } from "../lib/cache";
import * as openf1 from "../providers/openf1";
import { getDriverStandings, getConstructorStandings } from "../providers/jolpica";
import type { RaceResultEntry, RaceWeekend, Standing } from "../types";

// Данные OpenF1 сами по себе появляются быстро (минуты после гонки), но
// мы всё равно кэшируем на пару минут, чтобы не дёргать апстрим на
// каждый заход в мини-апп — это не про свежесть, а про вежливость к API.
const FAST_PATH_TTL_SECONDS = 2 * 60;
// Сопоставление season/round -> OpenF1 session_key не меняется после того,
// как сессия состоялась, поэтому кэшируем его надолго.
const SESSION_LOOKUP_TTL_SECONDS = 6 * 60 * 60;

async function findSessionCached(
  env: Env,
  weekend: RaceWeekend,
  sessionType: "Race" | "Qualifying",
): Promise<openf1.RawOpenF1Session | null> {
  const session = weekend.sessions.find((s) => s.type === (sessionType === "Race" ? "race" : "qualifying"));
  if (!session) return null;

  const cacheKey = `openf1:session:${weekend.id}:${sessionType}`;
  const cached = await env.DB.prepare("SELECT payload, expires_at FROM api_cache WHERE cache_key = ?")
    .bind(cacheKey)
    .first<{ payload: string; expires_at: string }>();
  if (cached && new Date(cached.expires_at) > new Date()) {
    return JSON.parse(cached.payload) as openf1.RawOpenF1Session;
  }

  const found = await openf1.findSession(weekend.season, sessionType, session.startUtc);
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
async function buildDriverCodeIndex(env: Env): Promise<Map<string, DriverIndexEntry>> {
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

function normalizeTeamName(name: string): string {
  return name.trim().toLowerCase();
}

/** normalized team name -> {id, name} из уже закэшированных Jolpica-standings. */
async function buildConstructorNameIndex(env: Env): Promise<Map<string, ConstructorIndexEntry>> {
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
  return String(row.position);
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
  const session = await findSessionCached(env, weekend, "Race");
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
          position: row.position,
          positionText: positionText(row),
          driver: { id: driver.id, code: driverMeta.name_acronym, fullName: driver.fullName },
          constructor,
          grid: gridByNumber.get(row.driver_number) ?? 0,
          laps: row.number_of_laps,
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
  const session = await findSessionCached(env, latestRace, "Race");
  if (!session) return null;

  return getOrRefresh(env, `openf1:standings:drivers:${latestRace.id}`, FAST_PATH_TTL_SECONDS, async () => {
    const [championship, drivers] = await Promise.all([
      openf1.getChampionshipDrivers(session.session_key),
      openf1.getSessionDrivers(session.session_key),
    ]);
    if (championship.length === 0) return null;

    const driverCodeIndex = await buildDriverCodeIndex(env);
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
        return {
          position: row.position_current,
          points: row.points_current,
          wins: 0, // OpenF1 championship_drivers не отдаёт число побед отдельно
          gapToLeader: row.points_current === leaderPoints ? 0 : leaderPoints - row.points_current,
          movement: "unknown" as const,
          driver: { id: driver.id, code: driverMeta.name_acronym, fullName: driver.fullName },
          constructor: undefined,
        };
      });

    return result.length > 0 ? result : null;
  });
}

/** Быстрый кубок конструкторов через OpenF1 championship_teams. */
export async function getFastConstructorStandings(env: Env, latestRace: RaceWeekend): Promise<Standing[] | null> {
  const session = await findSessionCached(env, latestRace, "Race");
  if (!session) return null;

  return getOrRefresh(env, `openf1:standings:constructors:${latestRace.id}`, FAST_PATH_TTL_SECONDS, async () => {
    const championship = await openf1.getChampionshipTeams(session.session_key);
    if (championship.length === 0) return null;

    const constructorNameIndex = await buildConstructorNameIndex(env);
    const sorted = [...championship].sort((a, b) => a.position_current - b.position_current);
    const leaderPoints = sorted[0]?.points_current ?? 0;

    const result: Standing[] = sorted.map((row) => {
      const constructor = constructorNameIndex.get(normalizeTeamName(row.team_name)) ?? {
        id: normalizeTeamName(row.team_name).replace(/\s+/g, "_"),
        name: row.team_name,
      };
      return {
        position: row.position_current,
        points: row.points_current,
        wins: 0,
        gapToLeader: row.points_current === leaderPoints ? 0 : leaderPoints - row.points_current,
        movement: "unknown" as const,
        constructor,
      };
    });

    return result.length > 0 ? result : null;
  });
}
