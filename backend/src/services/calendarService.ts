import type { Env } from "../env";
import { recomputeWeekendStatus } from "../mappers/raceWeekend";
import type { RaceWeekend } from "../types";

interface SeasonRaceRow {
  season: number;
  weekend_json: string;
}

/**
 * Раньше здесь был live-запрос к Jolpica через TTL-кэш api_cache (6ч) —
 * на "горячем" пути пользователя. Теперь календарь целиком читается из
 * season_races, которую наполняет cron (см. cron/syncCalendarAndStandings.ts) —
 * ни одного обращения к апстриму на этом пути больше нет.
 *
 * Статусы сессий/уик-энда в сохранённом JSON могут отставать от
 * реальности на время между тиками cron (до 15 минут) — recomputeWeekendStatus
 * пересчитывает их от уже сохранённых времён начала сессий, не делая
 * никаких дополнительных запросов.
 */
export async function getSeasonCalendar(env: Env): Promise<{ season: number; races: RaceWeekend[] }> {
  const { results } = await env.DB.prepare("SELECT season, weekend_json FROM season_races ORDER BY round ASC").all<SeasonRaceRow>();
  const rows = results ?? [];
  const now = new Date();
  const races = rows.map((row) => recomputeWeekendStatus(JSON.parse(row.weekend_json) as RaceWeekend, now));
  const season = rows[0]?.season ?? now.getUTCFullYear();
  return { season, races };
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
 * завершиться) — нужна и для result-based уведомлений, и для чтения
 * результатов последнего прошедшего этапа.
 */
export async function getMostRecentStartedRace(env: Env, now: Date = new Date()): Promise<RaceWeekend | null> {
  const { races } = await getSeasonCalendar(env);
  const started = races.filter((race) => {
    const raceSession = race.sessions.find((s) => s.type === "race");
    return raceSession && new Date(raceSession.startUtc) <= now;
  });
  return started.length > 0 ? started[started.length - 1] : null;
}
