import type { Env } from "../env";
import { errorReason } from "../lib/errors";
import { isStale, markSynced } from "./appState";
import { isRaceWeekend } from "./raceWeekend";
import { SubrequestBudget } from "./subrequestBudget";
import { syncCalendarAndStandings } from "./syncCalendarAndStandings";
import { syncActiveRounds } from "./syncActiveRounds";
import { backfillOlderRounds } from "./backfillOlderRounds";
import { syncNextEntity } from "./syncEntityRoundRobin";
import { getSeasonCalendar } from "../services/calendarService";

const HOT_KEY = "hot_sync";
// "Чаще во время гоночного уик-энда (15-30 минут), реже иначе" — из
// брифа. Верхняя граница берётся равной интервалу самого тика (15 минут),
// нижняя (вне уик-энда) — 6 часов, тот же порядок, что был у TTL
// календаря в старой on-demand модели (calendarService.ts).
const HOT_INTERVAL_RACE_WEEKEND_MS = 15 * 60 * 1000;
const HOT_INTERVAL_OFF_WEEKEND_MS = 6 * 60 * 60 * 1000;

/**
 * Точка входа для scheduled-триггера наполнения D1 (см.
 * backend/src/index.ts::scheduled, второй cron-триггер в wrangler.toml,
 * тикает каждые 15 минут). Каждая фаза
 * обёрнута в try/catch и делит общий бюджет подзапросов на тик (см.
 * subrequestBudget.ts) — сбой или нехватка бюджета в одной фазе не
 * блокирует остальные.
 *
 * Порядок фаз осознанный: календарь/standings/активные раунды — то, что
 * реально нужно "прямо сейчас" пользователю — идут первыми и получают
 * приоритет на бюджет; backfill старых раундов и round-robin карьеры —
 * фоновая работа, которой не страшно уступить бюджет в busy-тик.
 */
export async function runDataSync(env: Env): Promise<void> {
  const budget = new SubrequestBudget();
  const now = new Date();

  let { races } = await getSeasonCalendar(env);
  const weekendNow = isRaceWeekend(races, now);
  const hotIntervalMs = weekendNow ? HOT_INTERVAL_RACE_WEEKEND_MS : HOT_INTERVAL_OFF_WEEKEND_MS;

  if (await isStale(env, HOT_KEY, hotIntervalMs, now)) {
    try {
      await syncCalendarAndStandings(env, budget);
      await markSynced(env, HOT_KEY, now);
      ({ races } = await getSeasonCalendar(env)); // подхватить свежесинканный календарь для остальных фаз
    } catch (err) {
      console.error(`runDataSync: syncCalendarAndStandings failed (${errorReason(err)})`);
    }

    try {
      await syncActiveRounds(env, races, budget);
    } catch (err) {
      console.error(`runDataSync: syncActiveRounds failed (${errorReason(err)})`);
    }
  } else {
    console.log(`runDataSync: hot data fresh enough (raceWeekend=${weekendNow}), skipping calendar/standings/active-round refresh`);
  }

  try {
    await backfillOlderRounds(env, budget);
  } catch (err) {
    console.error(`runDataSync: backfillOlderRounds failed (${errorReason(err)})`);
  }

  try {
    await syncNextEntity(env, races, budget);
  } catch (err) {
    console.error(`runDataSync: syncNextEntity failed (${errorReason(err)})`);
  }

  console.log(`runDataSync: tick complete, subrequest budget left = ${budget.left}`);
}
