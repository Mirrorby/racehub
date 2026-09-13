import type { Env } from "../env";
import { errorReason } from "../lib/errors";
import type { RaceWeekend } from "../types";
import { syncRoundResults } from "./syncRoundResults";
import type { SubrequestBudget } from "./subrequestBudget";

const BACKFILL_BATCH_SIZE = 2;

interface PendingRow {
  race_id: string;
  weekend_json: string;
}

/**
 * "Очередь" backfill'а — не отдельный курсор в app_state, а прямой запрос
 * к season_races: любой раунд, чья сессия race уже завершилась (статус
 * зашит внутрь weekend_json) и для которого ещё нет race_results_json,
 * считается неподтянутым. Само-восстанавливающийся подход: если синк
 * раунда упал на середине (например кончился бюджет подзапросов) — тот
 * же раунд просто снова попадёт в выборку на следующем тике, без ручного
 * управления курсором.
 */
export async function backfillOlderRounds(env: Env, budget: SubrequestBudget): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT race_id, weekend_json FROM season_races
     WHERE race_results_json IS NULL
       AND json_extract(weekend_json, '$.status') = 'completed'
     ORDER BY round ASC
     LIMIT ?`,
  )
    .bind(BACKFILL_BATCH_SIZE)
    .all<PendingRow>();

  if (!results || results.length === 0) return;

  for (const row of results) {
    if (budget.left <= 0) break;
    try {
      const weekend = JSON.parse(row.weekend_json) as RaceWeekend;
      await syncRoundResults(env, weekend, budget);
    } catch (err) {
      console.error(`backfillOlderRounds: failed for ${row.race_id} (${errorReason(err)})`);
    }
  }
}
