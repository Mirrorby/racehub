import type { Env } from "../env";
import { errorReason } from "../lib/errors";
import type { PracticeResultEntry, QualifyingResultEntry, RaceResultEntry, RaceWeekend } from "../types";
import { getQualifyingResults, getRaceResults, getSprintResults } from "../providers/jolpica";
import { mapQualifyingResults, mapRaceResults, mapSprintResults } from "../mappers/raceResults";
import { getFastRaceResults } from "../services/liveResultsService";
import { getPracticeResults, getSprintQualifyingResults } from "../services/practiceResultsService";
import type { SubrequestBudget } from "./subrequestBudget";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Пауза между последовательными подзапросами внутри одного раунда — с
// запасом ниже burst-лимита Jolpica (4/сек = 250мс/запрос), и вежливо по
// отношению к OpenF1, у которого официальных лимитов нет, но который
// регулярно отдаёт 429 на холодных всплесках (см. providers/openf1.ts).
const PACE_MS = 350;

const PRACTICE_TYPES = ["fp1", "fp2", "fp3"] as const;

/**
 * Синхронизирует один этап целиком: race/qualifying/sprint (Jolpica, с
 * OpenF1 fast-path для race) + fp1/fp2/fp3/sprint-quali (OpenF1) —
 * СТРОГО последовательно, с паузой между запросами. Это осознанно НЕ
 * повторяет оркестровку raceDetailService.getRaceDetail (тот собирает
 * пять групп через Promise.all — именно так получались "15-20+
 * параллельных fetch на одну страницу гонки", из-за которых страницы
 * гонок массово не открывались). Здесь та же логика собрана заново на
 * уже существующих provider/service-функциях, но последовательно — см.
 * бриф, п. "Внутри cron ОБЯЗАТЕЛЬНО делать запросы... последовательно".
 */
export async function syncRoundResults(env: Env, weekend: RaceWeekend, budget: SubrequestBudget): Promise<void> {
  const qualifyingSession = weekend.sessions.find((s) => s.type === "qualifying");
  const raceSession = weekend.sessions.find((s) => s.type === "race");
  const sprintSession = weekend.sessions.find((s) => s.type === "sprint");
  const sprintQualiSession = weekend.sessions.find((s) => s.type === "sprint_quali");
  const practiceSessions = PRACTICE_TYPES.filter((type) => {
    const s = weekend.sessions.find((sess) => sess.type === type);
    return s && s.status !== "upcoming";
  });

  // Грубая оценка стоимости в подзапросах: race (до 2 — OpenF1 fast-path +
  // возможный фолбэк на Jolpica) + quali(1) + sprint(1) + практики (по 3 на
  // сессию: laps+position+drivers) + sprint-quali(2: results+drivers).
  // С запасом в бОльшую сторону — лучше недооценить бюджет и отложить до
  // следующего тика, чем упереться в лимит на середине.
  const estimatedCost =
    (raceSession && raceSession.status !== "upcoming" ? 2 : 0) +
    (qualifyingSession && qualifyingSession.status !== "upcoming" ? 1 : 0) +
    (sprintSession && sprintSession.status !== "upcoming" ? 1 : 0) +
    practiceSessions.length * 3 +
    (sprintQualiSession && sprintQualiSession.status !== "upcoming" ? 2 : 0);

  if (estimatedCost === 0) return; // ни одна сессия ещё не началась — синкать нечего

  if (!budget.tryConsume(estimatedCost)) {
    console.log(
      `syncRoundResults: not enough subrequest budget for ${weekend.id} (need ~${estimatedCost}, have ${budget.left}), deferring to next tick`,
    );
    return;
  }

  let raceResults: RaceResultEntry[] | null = null;
  if (raceSession && raceSession.status !== "upcoming") {
    try {
      raceResults = await getFastRaceResults(env, weekend);
    } catch (err) {
      console.error(`syncRoundResults: OpenF1 fast race results failed for ${weekend.id} (${errorReason(err)})`);
    }
    if (!raceResults) {
      await sleep(PACE_MS);
      try {
        const raw = await getRaceResults(weekend.round);
        raceResults = raw.length > 0 ? mapRaceResults(raw) : null;
      } catch (err) {
        console.error(`syncRoundResults: Jolpica race results failed for ${weekend.id} (${errorReason(err)})`);
      }
    }
  }

  let qualifyingResults: QualifyingResultEntry[] | null = null;
  if (qualifyingSession && qualifyingSession.status !== "upcoming") {
    await sleep(PACE_MS);
    try {
      const raw = await getQualifyingResults(weekend.round);
      qualifyingResults = raw.length > 0 ? mapQualifyingResults(raw) : null;
    } catch (err) {
      console.error(`syncRoundResults: qualifying results failed for ${weekend.id} (${errorReason(err)})`);
    }
  }

  let sprintResults: RaceResultEntry[] | null = null;
  if (sprintSession && sprintSession.status !== "upcoming") {
    await sleep(PACE_MS);
    try {
      const raw = await getSprintResults(weekend.round);
      sprintResults = raw.length > 0 ? mapSprintResults(raw) : null;
    } catch (err) {
      console.error(`syncRoundResults: sprint results failed for ${weekend.id} (${errorReason(err)})`);
    }
  }

  const practiceResults: Partial<Record<"fp1" | "fp2" | "fp3", PracticeResultEntry[] | null>> = {};
  for (const type of practiceSessions) {
    await sleep(PACE_MS);
    try {
      practiceResults[type] = await getPracticeResults(env, weekend, type);
    } catch (err) {
      console.error(`syncRoundResults: practice ${type} failed for ${weekend.id} (${errorReason(err)})`);
      practiceResults[type] = null;
    }
  }

  let sprintQualifyingResults: QualifyingResultEntry[] | null = null;
  if (sprintQualiSession && sprintQualiSession.status !== "upcoming") {
    await sleep(PACE_MS);
    try {
      sprintQualifyingResults = await getSprintQualifyingResults(env, weekend);
    } catch (err) {
      console.error(`syncRoundResults: sprint qualifying failed for ${weekend.id} (${errorReason(err)})`);
    }
  }

  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO season_races (race_id, season, round, circuit_id, weekend_json, race_results_json, qualifying_json, sprint_json, practice_json, sprint_quali_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(race_id) DO UPDATE SET
       race_results_json = excluded.race_results_json,
       qualifying_json = excluded.qualifying_json,
       sprint_json = excluded.sprint_json,
       practice_json = excluded.practice_json,
       sprint_quali_json = excluded.sprint_quali_json,
       updated_at = excluded.updated_at`,
  )
    .bind(
      weekend.id,
      weekend.season,
      weekend.round,
      weekend.circuitId,
      JSON.stringify(weekend),
      raceResults ? JSON.stringify(raceResults) : null,
      qualifyingResults ? JSON.stringify(qualifyingResults) : null,
      sprintResults ? JSON.stringify(sprintResults) : null,
      JSON.stringify(practiceResults),
      sprintQualifyingResults ? JSON.stringify(sprintQualifyingResults) : null,
      nowIso,
    )
    .run();
}
