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
 * зашит внутрь weekend_json), считается неподтянутым, если у него нет
 * race_results_json/qualifying_json (эти два есть у КАЖДОГО этапа), либо
 * нет sprint_json/sprint_quali_json ПРИ ТОМ, что в самом расписании
 * weekend_json для этого этапа такая сессия вообще значится (проверяем
 * через json_each по sessions — иначе спринт-раунды и обычные
 * бесконечно путались бы: у обычного уик-энда sprint_json пустой
 * ЗАКОННО, это не повод его пересинкать на каждом тике).
 *
 * Раньше проверялось только race_results_json IS NULL — из-за чего
 * несколько раундов молча застряли без quali/sprint/практики навсегда
 * (сеть подвела на конкретном подзапросе — что и произошло массово при
 * самом первом backfill'е четырнадцати раундов сразу после деплоя, ещё
 * до фикса пауз между запросами — race успевал записаться, а раунд с тех
 * пор ни разу не попадал в выборку backfill'а снова). Само-
 * восстанавливающийся подход: если синк раунда упал на середине — тот
 * же раунд снова попадёт в выборку на следующем тике, без ручного
 * управления курсором.
 */
export async function backfillOlderRounds(env: Env, budget: SubrequestBudget): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT race_id, weekend_json FROM season_races
     WHERE json_extract(weekend_json, '$.status') = 'completed'
       AND (
         race_results_json IS NULL
         OR qualifying_json IS NULL
         OR (sprint_json IS NULL AND EXISTS (
               SELECT 1 FROM json_each(weekend_json, '$.sessions') je
               WHERE json_extract(je.value, '$.type') = 'sprint'
             ))
         OR (sprint_quali_json IS NULL AND EXISTS (
               SELECT 1 FROM json_each(weekend_json, '$.sessions') je
               WHERE json_extract(je.value, '$.type') = 'sprint_quali'
             ))
         OR EXISTS (
               SELECT 1 FROM json_each(weekend_json, '$.sessions') je
               WHERE json_extract(je.value, '$.type') IN ('fp1', 'fp2', 'fp3')
                 AND json_extract(je.value, '$.status') != 'upcoming'
                 AND json_extract(practice_json, '$.' || json_extract(je.value, '$.type')) IS NULL
             )
       )
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
