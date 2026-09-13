import type { Env } from "../env";
import { errorReason } from "../lib/errors";
import type { RaceWeekend } from "../types";
import { syncRoundResults } from "./syncRoundResults";
import type { SubrequestBudget } from "./subrequestBudget";

/**
 * "Активные" раунды — текущий/ближайший ещё не завершённый этап и
 * предыдущий (результаты могут дозаполняться после разбора стюардов уже
 * после того, как этап помечен completed). В отличие от
 * backfillOlderRounds, здесь обновляются даже уже подтянутые результаты
 * (не только NULL), поскольку они могут измениться.
 */
export async function syncActiveRounds(env: Env, races: RaceWeekend[], budget: SubrequestBudget): Promise<void> {
  if (races.length === 0) return;

  const currentIndex = races.findIndex((r) => r.status !== "completed");
  const targets: RaceWeekend[] = [];
  if (currentIndex >= 0) {
    targets.push(races[currentIndex]);
    if (currentIndex > 0) targets.push(races[currentIndex - 1]);
  } else {
    // Сезон полностью завершён (или календарь ещё не знает о новом этапе) —
    // берём последний этап на случай, если результаты ещё дозаполняются.
    targets.push(races[races.length - 1]);
  }

  for (const weekend of targets) {
    try {
      await syncRoundResults(env, weekend, budget);
    } catch (err) {
      console.error(`syncActiveRounds: failed for ${weekend.id} (${errorReason(err)})`);
    }
  }
}
