import type { Env } from "../env";
import { errorReason } from "../lib/errors";
import { getCurrentSeasonRaces, getDriverStandings, getConstructorStandings } from "../providers/jolpica";
import { mapRaceWeekend } from "../mappers/raceWeekend";
import { mapDriverStandings, mapConstructorStandings } from "../mappers/standings";
import type { SubrequestBudget } from "./subrequestBudget";

interface TeamColorRow {
  constructor_id: string;
  color: string;
}

async function loadTeamColors(env: Env): Promise<Map<string, string>> {
  const { results } = await env.DB.prepare("SELECT constructor_id, color FROM team_colors").all<TeamColorRow>();
  return new Map((results ?? []).map((row) => [row.constructor_id, row.color]));
}

/**
 * Обновляет календарь (ВСЕ раунды сезона — прошедшие, текущий и будущие)
 * и personal/constructors standings. Раунды, которых ещё нет в
 * season_races, создаются здесь же строкой с одним weekend_json и пустыми
 * результатами — это и есть очередь для backfillOlderRounds: как только
 * раунд попадает в календарь и проходит, он сам "всплывает" в выборке на
 * подтяжку результатов, без отдельного курсора.
 *
 * Живые цвета команд (team_colors, см. syncEntityRoundRobin.ts) читаются
 * здесь из уже накопленной в D1 таблицы (без подзапросов) и вплетаются в
 * standings_cache сразу при записи — чтобы Standings-роут не пришлось на
 * чтении отдельно джойнить две таблицы.
 */
export async function syncCalendarAndStandings(env: Env, budget: SubrequestBudget): Promise<void> {
  if (!budget.tryConsume(3)) return; // 1 календарь + 2 standings

  const now = new Date();
  const nowIso = now.toISOString();

  try {
    const { season, races } = await getCurrentSeasonRaces();
    for (const raw of races) {
      const weekend = mapRaceWeekend(raw, now);
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
    }
    console.log(`syncCalendarAndStandings: calendar ok (season=${season}, races=${races.length})`);
  } catch (err) {
    console.error(`syncCalendarAndStandings: calendar sync failed (${errorReason(err)})`);
  }

  try {
    // Два независимых запроса — Promise.all здесь безопасен (это ровно 2
    // подзапроса, не 15+, как было на "горячем" пути страницы гонки).
    const [{ season: dSeason, standings: driverStandings }, { season: cSeason, standings: constructorStandings }] =
      await Promise.all([getDriverStandings(), getConstructorStandings()]);

    const liveColors = await loadTeamColors(env);
    const writeAt = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO standings_cache (type, season, data_json, updated_at) VALUES ('drivers', ?, ?, ?)
       ON CONFLICT(type, season) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
    )
      .bind(dSeason, JSON.stringify(mapDriverStandings(driverStandings, liveColors)), writeAt)
      .run();

    await env.DB.prepare(
      `INSERT INTO standings_cache (type, season, data_json, updated_at) VALUES ('constructors', ?, ?, ?)
       ON CONFLICT(type, season) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
    )
      .bind(cSeason, JSON.stringify(mapConstructorStandings(constructorStandings, liveColors)), writeAt)
      .run();
  } catch (err) {
    console.error(`syncCalendarAndStandings: standings sync failed (${errorReason(err)})`);
  }
}
