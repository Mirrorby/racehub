import type { Env } from "../env";
import { errorReason } from "../lib/errors";
import { computeConstructorStandings, computeDriverStandings, type StandingsMeta } from "../mappers/derivedStandings";
import type { Standing } from "../types";
import { getAppState, setAppState } from "./appState";
import { applyCareer, loadBaseline, type SeasonLeaders } from "./syncCareerFromResults";
import { latestRoundWithResults, loadConstructorTallies, loadDriverTallies } from "./seasonData";

/**
 * Всё, что можно посчитать из уже сохранённых результатов, считается здесь
 * и ТОЛЬКО из D1: личный зачёт, Кубок конструкторов и карьера. Ни одного
 * запроса к провайдерам — поэтому не ловит 429 и обновляется в тот же
 * (следующий за записью результата) тик.
 *
 * Работа выполняется только если результаты изменились с прошлого раза
 * (отпечаток в app_state), иначе тик стоит один дешёвый SQL-запрос. Чтобы
 * принудительно пересчитать — удалить ключ derived:fingerprint.
 */

const FINGERPRINT_KEY = "derived:fingerprint";

async function currentFingerprint(env: Env, baselineCount: number): Promise<string> {
  const row = await env.DB.prepare(
    `SELECT COALESCE((SELECT value FROM app_state WHERE key = 'results_rev'), '0') || '|' ||
            COALESCE((SELECT group_concat(race_id || ':' || COALESCE(length(race_results_json), 0) || ':' ||
                                          COALESCE(length(sprint_json), 0) || ':' || COALESCE(length(qualifying_json), 0), ',')
                        FROM (SELECT * FROM season_races ORDER BY season, round)), '') AS fp`,
  ).first<{ fp: string }>();
  return `${row?.fp ?? ""}|b${baselineCount}`;
}

async function loadMeta(env: Env, season: number): Promise<StandingsMeta> {
  const [cache, colors, media] = await Promise.all([
    env.DB.prepare("SELECT type, data_json FROM standings_cache WHERE season = ?").bind(season).all<{ type: string; data_json: string }>(),
    env.DB.prepare("SELECT constructor_id, color FROM team_colors").all<{ constructor_id: string; color: string }>(),
    env.DB.prepare("SELECT driver_id, headshot_url FROM driver_media WHERE headshot_url IS NOT NULL").all<{ driver_id: string; headshot_url: string }>(),
  ]);
  const meta: StandingsMeta = {
    drivers: new Map(),
    constructors: new Map(),
    colors: new Map((colors.results ?? []).map((r) => [r.constructor_id, r.color])),
    media: new Map((media.results ?? []).map((r) => [r.driver_id, r.headshot_url])),
  };
  for (const row of cache.results ?? []) {
    for (const s of JSON.parse(row.data_json) as Standing[]) {
      if (row.type === "drivers" && s.driver) meta.drivers.set(s.driver.id, s);
      if (row.type === "constructors" && s.constructor) meta.constructors.set(s.constructor.id, s);
    }
  }
  return meta;
}

async function writeStandingsIfChanged(env: Env, type: "drivers" | "constructors", season: number, standings: Standing[]): Promise<boolean> {
  const next = JSON.stringify(standings);
  const current = await env.DB.prepare("SELECT data_json FROM standings_cache WHERE type = ? AND season = ?")
    .bind(type, season)
    .first<{ data_json: string }>();
  if (current?.data_json === next) return false;
  await env.DB.prepare(
    `INSERT INTO standings_cache (type, season, data_json, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(type, season) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
  )
    .bind(type, season, next, new Date().toISOString())
    .run();
  return true;
}

/** true — результаты изменились и пересчёт выполнен (тяжёлая фаза). */
export async function syncDerivedFromResults(env: Env): Promise<boolean> {
  const baseline = await loadBaseline(env);
  const fingerprint = await currentFingerprint(env, baseline.length);
  if ((await getAppState(env, FINGERPRINT_KEY)) === fingerprint) return false;

  const maxSeasonRow = await env.DB.prepare("SELECT MAX(season) AS s FROM season_races").first<{ s: number | null }>();
  const maxSeason = maxSeasonRow?.s;
  if (!maxSeason) return false;

  const through = baseline.length > 0 ? Math.min(...baseline.map((b) => b.through_season)) : maxSeason - 1;
  const leaders: SeasonLeaders = new Map();

  // Сезон стендингов — самый свежий, по которому уже есть результат гонки.
  const latestSeasonRow = await env.DB.prepare("SELECT MAX(season) AS s FROM season_races WHERE race_results_json IS NOT NULL").first<{ s: number | null }>();
  const standingsSeason = latestSeasonRow?.s ?? null;

  if (standingsSeason !== null) {
    const lastRound = await latestRoundWithResults(env, standingsSeason);
    const meta = await loadMeta(env, standingsSeason);
    const [dNow, cNow, dPrev, cPrev] = await Promise.all([
      loadDriverTallies(env, standingsSeason),
      loadConstructorTallies(env, standingsSeason),
      lastRound ? loadDriverTallies(env, standingsSeason, lastRound) : Promise.resolve([]),
      lastRound ? loadConstructorTallies(env, standingsSeason, lastRound) : Promise.resolve([]),
    ]);
    const drivers = computeDriverStandings(dNow, dPrev, meta);
    const constructors = computeConstructorStandings(cNow, cPrev, meta);
    leaders.set(standingsSeason, { drivers: drivers[0]?.driver?.id, constructors: constructors[0]?.constructor?.id });
    await writeStandingsIfChanged(env, "drivers", standingsSeason, drivers);
    await writeStandingsIfChanged(env, "constructors", standingsSeason, constructors);
  }

  try {
    const updated = await applyCareer(env, baseline, Math.min(through, maxSeason - 1), leaders);
    if (updated > 0) console.log(`syncDerivedFromResults: updated ${updated} career rows`);
  } catch (err) {
    console.error(`syncDerivedFromResults: career update failed (${errorReason(err)})`);
    return true; // отпечаток не сохраняем — повторим на следующем тике
  }

  await setAppState(env, FINGERPRINT_KEY, fingerprint);
  return true;
}
