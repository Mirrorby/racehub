import type { Env } from "../env";
import { getOrRefresh } from "../lib/cache";
import { getCurrentSeasonRaces } from "../providers/jolpica";
import { mapRaceWeekend } from "../mappers/raceWeekend";
import type { RaceWeekend } from "../types";

// Календарь на сезон вперёд объявлен FIA заранее и меняется редко (разве
// что форс-мажор с переносом этапа) — 6 часов TTL достаточно, чтобы не
// упираться в rate limit, и достаточно свежо для таких правок.
const CALENDAR_TTL_SECONDS = 6 * 60 * 60;

export async function getSeasonCalendar(env: Env): Promise<{ season: number; races: RaceWeekend[] }> {
  const { season, races } = await getOrRefresh(env, "calendar:current", CALENDAR_TTL_SECONDS, getCurrentSeasonRaces);
  const now = new Date();
  return { season, races: races.map((race) => mapRaceWeekend(race, now)) };
}

/** Ближайший ещё не завершённый гоночный уик-энд, либо null в межсезонье. */
export async function getNextRaceWeekend(env: Env): Promise<RaceWeekend | null> {
  const { races } = await getSeasonCalendar(env);
  // races уже отсортированы по раунду, т.е. хронологически — первый
  // не "completed" и есть следующий/текущий уик-энд.
  return races.find((race) => race.status !== "completed") ?? null;
}

/**
 * Ближайшая к "сейчас" гонка, чья сессия race уже стартовала (т.е. могла
 * завершиться) — нужна и для result-based уведомлений, и для live-standings
 * (сведение с OpenF1 требует знать "какая именно гонка только что прошла").
 */
export async function getMostRecentStartedRace(env: Env, now: Date = new Date()): Promise<RaceWeekend | null> {
  const { races } = await getSeasonCalendar(env);
  const started = races.filter((race) => {
    const raceSession = race.sessions.find((s) => s.type === "race");
    return raceSession && new Date(raceSession.startUtc) <= now;
  });
  return started.length > 0 ? started[started.length - 1] : null;
}
