import type { Env } from "../env";
import { errorReason } from "../lib/errors";
import { sleep, UPSTREAM_PACE_MS } from "../lib/pace";
import { getCurrentSeasonRaces, getDriverStandings, getConstructorStandings } from "../providers/jolpica";
import { mapRaceWeekend } from "../mappers/raceWeekend";
import { mapDriverStandings, mapConstructorStandings } from "../mappers/standings";
import { getFastDriverStandings, getFastConstructorStandings } from "../services/liveResultsService";
import { findLatestStartedRace } from "./raceWeekend";
import type { RaceWeekend, Standing } from "../types";
import type { SubrequestBudget } from "./subrequestBudget";

interface TeamColorRow {
  constructor_id: string;
  color: string;
}

interface DriverMediaRow {
  driver_id: string;
  headshot_url: string | null;
}

interface WeekendRow {
  weekend_json: string;
}

async function loadRacesFromDb(env: Env): Promise<RaceWeekend[]> {
  const { results } = await env.DB.prepare("SELECT weekend_json FROM season_races ORDER BY round ASC").all<WeekendRow>();
  return (results ?? []).map((row) => JSON.parse(row.weekend_json) as RaceWeekend);
}

async function loadTeamColors(env: Env): Promise<Map<string, string>> {
  const { results } = await env.DB.prepare("SELECT constructor_id, color FROM team_colors").all<TeamColorRow>();
  return new Map((results ?? []).map((row) => [row.constructor_id, row.color]));
}

async function loadDriverMedia(env: Env): Promise<Map<string, string>> {
  const { results } = await env.DB.prepare("SELECT driver_id, headshot_url FROM driver_media WHERE headshot_url IS NOT NULL").all<DriverMediaRow>();
  return new Map((results ?? []).map((row) => [row.driver_id, row.headshot_url as string]));
}

async function writeStandings(env: Env, type: "drivers" | "constructors", season: number, standings: Standing[]): Promise<void> {
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO standings_cache (type, season, data_json, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(type, season) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
  )
    .bind(type, season, JSON.stringify(standings), nowIso)
    .run();
}

/**
 * Обновляет календарь (ВСЕ раунды сезона — прошедшие, текущий и будущие)
 * и personal/constructors standings. Раунды, которых ещё нет в
 * season_races, создаются здесь же строкой с одним weekend_json и пустыми
 * результатами — это и есть очередь для backfillOlderRounds: как только
 * раунд попадает в календарь и проходит, он сам "всплывает" в выборке на
 * подтяжку результатов, без отдельного курсора.
 *
 * Standings: сперва пробуем OpenF1 fast-path (минуты после гонки), а не
 * сразу Jolpica batch (та по своим словам целится в "раз в неделю") — та
 * же логика, что раньше жила в routes/standings.ts на "горячем" пути
 * (routes/standings.ts::tryFastStandings), просто теперь она выполняется
 * в cron, а не на каждый заход пользователя. Именно эта задержка Jolpica
 * (а не 30-60 минут OpenF1) была одной из исходных жалоб в брифе — важно
 * было не потерять её при переносе.
 */
export async function syncCalendarAndStandings(env: Env, budget: SubrequestBudget): Promise<void> {
  // 1 календарь + до ~6 на standings (fast-path сессия+championship+
  // drivers на каждый из двух типов, с запасом на возможный Jolpica-фолбэк).
  if (!budget.tryConsume(10)) return;

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
    // Пауза перед первым запросом этой фазы — на случай, если сразу перед
    // ней успел выполниться запрос календаря выше (та же причина, из-за
    // которой без этой паузы в проде ловили 429 на constructorStandings:
    // календарь + standings улетали практически одним залпом).
    await sleep(UPSTREAM_PACE_MS);

    const races = await loadRacesFromDb(env);
    const latestRace = findLatestStartedRace(races, now);
    const liveColors = await loadTeamColors(env);
    const driverMedia = await loadDriverMedia(env);

    let driverStandings: Standing[] | null = null;
    let constructorStandings: Standing[] | null = null;
    let season: number | null = latestRace?.season ?? null;

    if (latestRace) {
      driverStandings = await getFastDriverStandings(env, latestRace).catch((err) => {
        console.error(`syncCalendarAndStandings: OpenF1 fast driver standings failed (${errorReason(err)}), will fall back to Jolpica`);
        return null;
      });
      await sleep(UPSTREAM_PACE_MS);
      constructorStandings = await getFastConstructorStandings(env, latestRace).catch((err) => {
        console.error(
          `syncCalendarAndStandings: OpenF1 fast constructor standings failed (${errorReason(err)}), will fall back to Jolpica`,
        );
        return null;
      });
    }

    if (!driverStandings) {
      if (latestRace) await sleep(UPSTREAM_PACE_MS); // fast-path уже что-то успел запросить выше
      const raw = await getDriverStandings();
      season = raw.season;
      driverStandings = mapDriverStandings(raw.standings, liveColors, driverMedia);
    }
    if (!constructorStandings) {
      await sleep(UPSTREAM_PACE_MS);
      const raw = await getConstructorStandings();
      season = raw.season;
      constructorStandings = mapConstructorStandings(raw.standings, liveColors);
    }

    await writeStandings(env, "drivers", season ?? now.getUTCFullYear(), driverStandings);
    await writeStandings(env, "constructors", season ?? now.getUTCFullYear(), constructorStandings);
  } catch (err) {
    console.error(`syncCalendarAndStandings: standings sync failed (${errorReason(err)})`);
  }
}
