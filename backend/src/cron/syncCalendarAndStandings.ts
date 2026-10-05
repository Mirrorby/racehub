import type { Env } from "../env";
import { errorReason } from "../lib/errors";
import { sleep, UPSTREAM_PACE_MS } from "../lib/pace";
import { getCurrentSeasonRaces, getDriverStandings, getConstructorStandings } from "../providers/jolpica";
import { mapRaceWeekend } from "../mappers/raceWeekend";
import { mapDriverStandings, mapConstructorStandings } from "../mappers/standings";
import type { RaceWeekend, Standing } from "../types";
import type { SubrequestBudget } from "./subrequestBudget";

/**
 * Календарь сезона из Jolpica — раз в несколько часов, а не каждый тик.
 *
 * Статусы сессий (upcoming/live/completed) от календаря не зависят: они
 * пересчитываются от времён начала при каждом чтении
 * (services/calendarService.ts → recomputeWeekendStatus). Поэтому календарь
 * нужен только затем, чтобы заметить перенос сессии, новый этап или
 * смену названия, — и пишем только те этапы, у которых расписание
 * реально изменилось (раньше на каждом тике перезаписывались все 24 строки).
 *
 * Результаты этапов эта функция НЕ трогает.
 */

export function scheduleKey(w: RaceWeekend): string {
  return JSON.stringify([w.name, w.country, w.countryCode, w.city, w.circuit, w.circuitId, w.sessions.map((s) => [s.type, s.startUtc])]);
}

/** true — был сетевой запрос (тяжёлая фаза). */
export async function syncCalendar(env: Env, budget: SubrequestBudget, now: Date): Promise<boolean> {
  if (!budget.tryConsume(2)) return false;

  const { season, races } = await getCurrentSeasonRaces();
  const { results } = await env.DB.prepare("SELECT race_id, weekend_json FROM season_races WHERE season = ?")
    .bind(season)
    .all<{ race_id: string; weekend_json: string }>();
  const stored = new Map((results ?? []).map((r) => [r.race_id, scheduleKey(JSON.parse(r.weekend_json) as RaceWeekend)]));

  const nowIso = now.toISOString();
  let changed = 0;
  for (const raw of races) {
    const weekend = mapRaceWeekend(raw, now);
    if (stored.get(weekend.id) === scheduleKey(weekend)) continue;
    await env.DB.prepare(
      `INSERT INTO season_races (race_id, season, round, circuit_id, weekend_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(race_id) DO UPDATE SET
         weekend_json = excluded.weekend_json,
         season = excluded.season,
         round = excluded.round,
         circuit_id = excluded.circuit_id,
         updated_at = excluded.updated_at`,
    )
      .bind(weekend.id, weekend.season, weekend.round, weekend.circuitId, JSON.stringify(weekend), nowIso)
      .run();
    changed += 1;
  }
  console.log(`syncCalendar: season=${season}, races=${races.length}, changed=${changed}`);
  return true;
}

/**
 * Запасной источник стендингов — ТОЛЬКО пока по сезону нет ни одного
 * результата и таблицы ещё нет (начало сезона). Дальше стендинги считает
 * syncDerivedFromResults из результатов в D1 и этот источник их не
 * перезаписывает (Jolpica отстаёт от гонки на дни).
 */
export async function syncStandingsFallback(env: Env, budget: SubrequestBudget): Promise<boolean> {
  const existing = await env.DB.prepare("SELECT COUNT(*) AS n FROM standings_cache").first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) return false;
  if (!budget.tryConsume(2)) return false;

  const [colors, media] = await Promise.all([
    env.DB.prepare("SELECT constructor_id, color FROM team_colors").all<{ constructor_id: string; color: string }>(),
    env.DB.prepare("SELECT driver_id, headshot_url FROM driver_media WHERE headshot_url IS NOT NULL").all<{ driver_id: string; headshot_url: string }>(),
  ]);
  const liveColors = new Map((colors.results ?? []).map((r) => [r.constructor_id, r.color]));
  const driverMedia = new Map((media.results ?? []).map((r) => [r.driver_id, r.headshot_url]));

  const write = async (type: "drivers" | "constructors", season: number, standings: Standing[]) => {
    await env.DB.prepare(
      `INSERT INTO standings_cache (type, season, data_json, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(type, season) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
    )
      .bind(type, season, JSON.stringify(standings), new Date().toISOString())
      .run();
  };

  try {
    const drivers = await getDriverStandings();
    await write("drivers", drivers.season, mapDriverStandings(drivers.standings, liveColors, driverMedia));
    await sleep(UPSTREAM_PACE_MS);
    const constructors = await getConstructorStandings();
    await write("constructors", constructors.season, mapConstructorStandings(constructors.standings, liveColors));
  } catch (err) {
    console.error(`syncStandingsFallback: failed (${errorReason(err)})`);
  }
  return true;
}
