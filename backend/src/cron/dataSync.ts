import type { Env } from "../env";
import { errorReason } from "../lib/errors";
import { getSeasonCalendar } from "../services/calendarService";
import type { RaceWeekend } from "../types";
import { getAppState, isStale, markSynced, setAppState } from "./appState";
import { runCleanup } from "./cleanup";
import { SubrequestBudget } from "./subrequestBudget";
import { syncCalendar, syncStandingsFallback } from "./syncCalendarAndStandings";
import { syncDerivedFromResults } from "./syncDerivedFromResults";
import { syncNextEntity } from "./syncEntityRoundRobin";
import { syncNextResultItem } from "./syncRoundResults";
import { syncTitleProgress } from "./syncTitleProgress";

const CALENDAR_KEY = "calendar";
const CALENDAR_INTERVAL_MS = 6 * 60 * 60 * 1000;
// После неудачи (429 и т. п.) не долбим Jolpica каждый тик.
const CALENDAR_RETRY_AFTER_FAILURE_MS = 30 * 60 * 1000;
const SLOT_MS = 5 * 60 * 1000;

/**
 * Точка входа cron-синка D1 (src/index.ts::scheduled, триггер раз в 5 минут).
 *
 * Проектируется под Workers Free: 10 мс CPU на запуск. Раньше тик делал всё
 * подряд (календарь, стендинги, все сессии активных этапов, backfill,
 * карьера) и упирался в лимит (outcome "exceededCpu"), не дойдя до
 * результата гонки. Теперь:
 *
 *  - фазы идут по приоритету: срочные результаты → пересчёт стендингов/
 *    карьеры → практики и перепроверки → календарь → фон (round-robin,
 *    титулы, чистка);
 *  - за тик выполняется не больше SYNC_PHASES_PER_TICK тяжёлых фаз
 *    (по умолчанию 1); каждая фаза идемпотентна и сама решает, есть ли ей
 *    работа, так что остальное доедет на следующих тиках — 5 минут спустя;
 *  - «пустой» тик (работы нет) — один-два дешёвых SQL-запроса.
 *
 * На Workers Paid лимит CPU 30 с — тогда можно поставить
 * SYNC_PHASES_PER_TICK=4 в wrangler.toml и всё выполняется за один тик.
 */
export async function runDataSync(env: Env): Promise<void> {
  const budget = new SubrequestBudget();
  const now = new Date();
  const maxHeavy = Math.max(1, Number(env.SYNC_PHASES_PER_TICK ?? 1) || 1);
  let heavy = 0;

  const phase = async (name: string, fn: () => Promise<boolean | void>): Promise<void> => {
    if (heavy >= maxHeavy) return;
    try {
      if ((await fn()) === true) heavy += 1;
    } catch (err) {
      console.error(`runDataSync: ${name} failed (${errorReason(err)})`);
    }
  };

  let races: RaceWeekend[] = [];
  try {
    races = (await getSeasonCalendar(env)).races;
  } catch (err) {
    console.error(`runDataSync: reading calendar from D1 failed (${errorReason(err)})`);
  }

  // 1. Результаты этапов, которых ждут прямо сейчас (гонка, квалификация,
  //    спринт) — самое ценное, идёт первым.
  await phase("results", () => syncNextResultItem(env, races, budget, now, "urgent"));

  // 2. Стендинги и карьера из сохранённых результатов (только D1).
  await phase("derived", () => syncDerivedFromResults(env));

  // 2b. Практики и контрольные перепроверки гонки по официальным данным.
  await phase("results (background)", () => syncNextResultItem(env, races, budget, now, "background"));

  // 3. Календарь — раз в 6 часов (и сразу, если в D1 ещё пусто).
  await phase("calendar", async () => {
    const due = races.length === 0 || (await isStale(env, CALENDAR_KEY, CALENDAR_INTERVAL_MS, now));
    if (!due) return false;
    const lastAttempt = await getAppState(env, `${CALENDAR_KEY}:attempt_at`);
    if (lastAttempt && now.getTime() - new Date(lastAttempt).getTime() < CALENDAR_RETRY_AFTER_FAILURE_MS) return false;
    await setAppState(env, `${CALENDAR_KEY}:attempt_at`, now.toISOString());
    const fetched = await syncCalendar(env, budget, now);
    if (fetched) {
      await markSynced(env, CALENDAR_KEY, now);
      await syncStandingsFallback(env, budget);
    }
    return fetched;
  });

  // 4. Фон — по одному заданию за тик, по кругу.
  const slot = Math.floor(now.getTime() / SLOT_MS) % 3;
  if (slot === 0) await phase("entity round-robin", async () => (await syncNextEntity(env, races, budget), true));
  if (slot === 1) await phase("titles", async () => (await syncTitleProgress(env, budget), true));
  if (slot === 2) await phase("cleanup", async () => (await runCleanup(env), false));
}
