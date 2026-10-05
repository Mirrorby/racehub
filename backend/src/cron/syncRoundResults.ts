import type { Env } from "../env";
import { errorReason } from "../lib/errors";
import { sleep, UPSTREAM_PACE_MS } from "../lib/pace";
import type { QualifyingResultEntry, RaceResultEntry, RaceWeekend, SessionType } from "../types";
import { getQualifyingResults, getRaceResults, getSprintResults } from "../providers/jolpica";
import { mapQualifyingResults, mapRaceResults, mapSprintResults } from "../mappers/raceResults";
import { getFastRaceResults } from "../services/liveResultsService";
import { getPracticeResults, getSprintQualifyingResults } from "../services/practiceResultsService";
import { getAppState, setAppState } from "./appState";
import type { SubrequestBudget } from "./subrequestBudget";

/**
 * Инкрементальный синк результатов: за один вызов делается РОВНО ОДНА
 * единица работы (результат гонки, ИЛИ квалификация, ИЛИ одна практика…) —
 * самая приоритетная из недостающих по всему сезону.
 *
 * Почему так. Раньше каждый тик заново тянул ВСЕ сессии активных этапов
 * (три практики по ~3 запроса с тысячами кругов, квалификацию, гонку) и
 * перезаписывал строку целиком. На Workers Free у cron-запуска 10 мс CPU:
 * тик упирался в лимит (outcome "exceededCpu" в логах) и обрывался, так и
 * не дойдя до результата гонки — он шёл ПОСЛЕ календаря и standings.
 * Практики/квалификация/спринт после окончания сессии не меняются, поэтому
 * тянем их один раз и больше не трогаем; гонку опрашиваем, пока её нет, а
 * потом ещё несколько раз по расписанию, чтобы поймать решения стюардов.
 */

export type WorkKind = "race" | "qualifying" | "sprint" | "sprint_quali" | "practice" | "race_final";
type PracticeType = "fp1" | "fp2" | "fp3";
const PRACTICE_TYPES: PracticeType[] = ["fp1", "fp2", "fp3"];

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Гонка длится ≤ ~2 ч от старта; OpenF1 публикует классификацию через
// несколько минут после официальной. С 100-й минуты спрашиваем каждый тик.
export const RACE_POLL_AFTER_MS = 100 * MIN;
// Jolpica как запасной источник для первой записи гонки — не раньше, чем
// через 4 часа (раньше он заведомо пуст, а запрос расходует лимит 429).
const RACE_JOLPICA_FALLBACK_AFTER_MS = 4 * HOUR;
// Контрольные перепроверки по официальным данным Jolpica (штрафы стюардов,
// правильные команды на этап): через 8 ч, сутки+, трое суток, неделю.
export const FINAL_PASS_SCHEDULE_MS = [8 * HOUR, 30 * HOUR, 72 * HOUR, 7 * DAY];
const FINAL_PASS_WINDOW_MS = 10 * DAY;
// Не гоняемся за недостающими данными вечно.
const GIVE_UP_RACE_MS = 30 * DAY;
const GIVE_UP_OTHER_MS = 21 * DAY;
// Полноценная классификация — не меньше стольких строк (в сезоне ≥ 20
// машин); защита от записи полупустого ответа апстрима.
export const MIN_CLASSIFIED_ENTRIES = 10;

const BACKOFF_MS: Record<WorkKind, number> = {
  race: 4 * MIN,
  qualifying: 10 * MIN,
  sprint: 10 * MIN,
  sprint_quali: 20 * MIN,
  practice: 20 * MIN,
  race_final: 60 * MIN,
};

// Приоритет (меньше — раньше): гонка важнее всего.
const RANK: Record<WorkKind, number> = { race: 0, qualifying: 1, sprint: 2, sprint_quali: 3, practice: 4, race_final: 5 };

const URGENT_MAX_RANK = 3;

// Грубая оценка подзапросов на единицу работы — с запасом на ретраи (OpenF1 при
// сбое повторяет каждый из трёх запросов гонки до 4 раз).
const COST: Record<WorkKind, number> = { race: 14, qualifying: 1, sprint: 1, sprint_quali: 3, practice: 4, race_final: 1 };

export interface RoundPresence {
  raceId: string;
  hasRace: boolean;
  hasQuali: boolean;
  hasSprint: boolean;
  hasSprintQuali: boolean;
  hasFp: Record<PracticeType, boolean>;
}

export interface RoundMarkers {
  finalPasses: number;
  attemptAt: Partial<Record<WorkKind, number>>;
}

export interface WorkItem {
  weekend: RaceWeekend;
  kind: WorkKind;
  practiceType?: PracticeType;
}

function sessionOf(weekend: RaceWeekend, type: SessionType) {
  return weekend.sessions.find((s) => s.type === type);
}

/** Чистая функция: что ещё нужно подтянуть по этому этапу. Без обращений к сети и БД. */
export function planWorkItems(weekend: RaceWeekend, presence: RoundPresence, markers: RoundMarkers, now: Date): WorkItem[] {
  if (weekend.status === "cancelled") return [];
  const nowMs = now.getTime();
  const items: WorkItem[] = [];
  const backoffOk = (kind: WorkKind): boolean => nowMs - (markers.attemptAt[kind] ?? 0) >= BACKOFF_MS[kind];

  const race = sessionOf(weekend, "race");
  if (race) {
    const raceStart = new Date(race.startUtc).getTime();
    if (!presence.hasRace) {
      if (nowMs >= raceStart + RACE_POLL_AFTER_MS && nowMs < raceStart + GIVE_UP_RACE_MS && backoffOk("race")) {
        items.push({ weekend, kind: "race" });
      }
    } else {
      const due = FINAL_PASS_SCHEDULE_MS[markers.finalPasses];
      if (due !== undefined && nowMs >= raceStart + due && nowMs < raceStart + FINAL_PASS_WINDOW_MS && backoffOk("race_final")) {
        items.push({ weekend, kind: "race_final" });
      }
    }
  }

  const finishedAndFresh = (type: SessionType): boolean => {
    const s = sessionOf(weekend, type);
    return !!s && s.status === "completed" && nowMs - new Date(s.startUtc).getTime() < GIVE_UP_OTHER_MS;
  };

  if (finishedAndFresh("qualifying") && !presence.hasQuali && backoffOk("qualifying")) items.push({ weekend, kind: "qualifying" });
  if (finishedAndFresh("sprint") && !presence.hasSprint && backoffOk("sprint")) items.push({ weekend, kind: "sprint" });
  if (finishedAndFresh("sprint_quali") && !presence.hasSprintQuali && backoffOk("sprint_quali")) {
    items.push({ weekend, kind: "sprint_quali" });
  }
  if (backoffOk("practice")) {
    const missing = PRACTICE_TYPES.find((type) => finishedAndFresh(type) && !presence.hasFp[type]);
    if (missing) items.push({ weekend, kind: "practice", practiceType: missing });
  }
  return items;
}

/** Самый приоритетный пункт из всех этапов; при равном приоритете — более свежий этап. */
export function pickBest(items: WorkItem[]): WorkItem | null {
  if (items.length === 0) return null;
  return [...items].sort((a, b) => RANK[a.kind] - RANK[b.kind] || b.weekend.round - a.weekend.round)[0];
}

interface PresenceRow {
  race_id: string;
  has_race: number;
  has_quali: number;
  has_sprint: number;
  has_sprint_quali: number;
  has_fp1: number;
  has_fp2: number;
  has_fp3: number;
}

// Наличие считаем в самом SQLite (json_extract) — ни одного JSON.parse в воркере.
async function loadPresence(env: Env): Promise<Map<string, RoundPresence>> {
  const { results } = await env.DB.prepare(
    `SELECT race_id,
            race_results_json IS NOT NULL AS has_race,
            qualifying_json IS NOT NULL AS has_quali,
            sprint_json IS NOT NULL AS has_sprint,
            sprint_quali_json IS NOT NULL AS has_sprint_quali,
            json_extract(practice_json, '$.fp1') IS NOT NULL AS has_fp1,
            json_extract(practice_json, '$.fp2') IS NOT NULL AS has_fp2,
            json_extract(practice_json, '$.fp3') IS NOT NULL AS has_fp3
       FROM season_races`,
  ).all<PresenceRow>();
  return new Map(
    (results ?? []).map((r) => [
      r.race_id,
      {
        raceId: r.race_id,
        hasRace: !!r.has_race,
        hasQuali: !!r.has_quali,
        hasSprint: !!r.has_sprint,
        hasSprintQuali: !!r.has_sprint_quali,
        hasFp: { fp1: !!r.has_fp1, fp2: !!r.has_fp2, fp3: !!r.has_fp3 },
      },
    ]),
  );
}

const MARKER_PREFIX = "sync:";

async function loadMarkers(env: Env): Promise<Map<string, RoundMarkers>> {
  const { results } = await env.DB.prepare("SELECT key, value FROM app_state WHERE key LIKE 'sync:%'").all<{ key: string; value: string }>();
  const out = new Map<string, RoundMarkers>();
  for (const { key, value } of results ?? []) {
    // sync:<raceId>:final | sync:<raceId>:attempt:<kind>
    const parts = key.split(":");
    const raceId = parts[1];
    if (!raceId) continue;
    const entry = out.get(raceId) ?? { finalPasses: 0, attemptAt: {} };
    if (parts[2] === "final") entry.finalPasses = Number(value) || 0;
    if (parts[2] === "attempt" && parts[3]) {
      const ms = new Date(value).getTime();
      if (Number.isFinite(ms)) entry.attemptAt[parts[3] as WorkKind] = ms;
    }
    out.set(raceId, entry);
  }
  return out;
}

async function markAttempt(env: Env, raceId: string, kind: WorkKind, now: Date): Promise<void> {
  await setAppState(env, `${MARKER_PREFIX}${raceId}:attempt:${kind}`, now.toISOString());
}

// Любая запись результатов поднимает счётчик — по нему syncDerivedFromResults
// понимает, что standings/карьеру надо пересчитать.
async function bumpResultsRev(env: Env): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO app_state (key, value, updated_at) VALUES ('results_rev', '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1, updated_at = excluded.updated_at`,
  ).run();
}

type ResultColumn = "race_results_json" | "qualifying_json" | "sprint_json" | "sprint_quali_json" | "practice_json";

async function writeColumn(env: Env, raceId: string, column: ResultColumn, value: unknown): Promise<void> {
  // column — только из закрытого списка выше, не из внешнего ввода.
  const res = await env.DB.prepare(`UPDATE season_races SET ${column} = ?, updated_at = ? WHERE race_id = ?`)
    .bind(JSON.stringify(value), new Date().toISOString(), raceId)
    .run();
  if (res.meta.changes === 0) {
    console.error(`syncRoundResults: season_races row ${raceId} does not exist, ${column} not saved`);
    return;
  }
  if (column !== "practice_json") await bumpResultsRev(env);
}

const isFullClassification = (r: RaceResultEntry[] | null): r is RaceResultEntry[] => !!r && r.length >= MIN_CLASSIFIED_ENTRIES;

async function runRace(env: Env, weekend: RaceWeekend, now: Date): Promise<boolean> {
  const race = sessionOf(weekend, "race");
  let results: RaceResultEntry[] | null = null;
  try {
    results = await getFastRaceResults(env, weekend);
  } catch (err) {
    console.error(`syncRoundResults: OpenF1 race results failed for ${weekend.id} (${errorReason(err)})`);
  }
  if (!isFullClassification(results) && race && now.getTime() >= new Date(race.startUtc).getTime() + RACE_JOLPICA_FALLBACK_AFTER_MS) {
    await sleep(UPSTREAM_PACE_MS);
    try {
      const raw = await getRaceResults(weekend.round);
      results = raw.length > 0 ? mapRaceResults(raw) : null;
    } catch (err) {
      console.error(`syncRoundResults: Jolpica race results failed for ${weekend.id} (${errorReason(err)})`);
    }
  }
  if (!isFullClassification(results)) return false;
  await writeColumn(env, weekend.id, "race_results_json", results);
  console.log(`syncRoundResults: race results saved for ${weekend.id} (${results.length} entries)`);
  return true;
}

async function runRaceFinal(env: Env, weekend: RaceWeekend, passes: number): Promise<boolean> {
  const raw = await getRaceResults(weekend.round);
  // Проход засчитываем, когда Jolpica ОТВЕТИЛ (даже пустым) — иначе пустой
  // ответ повторялся бы каждый час до конца окна. Сбой запроса (429, сеть)
  // проходом не считается: исключение вылетает выше, повтор через бэкофф.
  await setAppState(env, `${MARKER_PREFIX}${weekend.id}:final`, String(passes + 1));
  const official = raw.length > 0 ? mapRaceResults(raw) : null;
  if (!isFullClassification(official)) return false;

  const stored = await env.DB.prepare("SELECT race_results_json FROM season_races WHERE race_id = ?")
    .bind(weekend.id)
    .first<{ race_results_json: string | null }>();
  if (stored?.race_results_json === JSON.stringify(official)) return false;

  await writeColumn(env, weekend.id, "race_results_json", official);
  console.log(`syncRoundResults: ${weekend.id} race results replaced by official Jolpica classification (pass ${passes + 1})`);
  return true;
}

async function runPractice(env: Env, weekend: RaceWeekend, type: PracticeType): Promise<boolean> {
  const result = await getPracticeResults(env, weekend, type);
  if (!result || result.length === 0) return false;
  const row = await env.DB.prepare("SELECT practice_json FROM season_races WHERE race_id = ?")
    .bind(weekend.id)
    .first<{ practice_json: string | null }>();
  const current = row?.practice_json ? (JSON.parse(row.practice_json) as Record<string, unknown>) : {};
  await writeColumn(env, weekend.id, "practice_json", { ...current, [type]: result });
  return true;
}

/** Выполняет один пункт. true — что-то записано. */
export async function runWorkItem(
  env: Env,
  item: WorkItem,
  markers: RoundMarkers | undefined,
  budget: SubrequestBudget,
  now: Date,
): Promise<{ attempted: boolean; wrote: boolean }> {
  if (!budget.tryConsume(COST[item.kind])) {
    console.log(`syncRoundResults: not enough subrequest budget for ${item.kind} ${item.weekend.id} (need ~${COST[item.kind]}, have ${budget.left})`);
    return { attempted: false, wrote: false };
  }
  const { weekend, kind } = item;
  // Отметка попытки ДО запроса: если воркер упадёт посреди — не зациклимся.
  await markAttempt(env, weekend.id, kind, now);

  let wrote = false;
  try {
    switch (kind) {
      case "race":
        wrote = await runRace(env, weekend, now);
        break;
      case "race_final":
        wrote = await runRaceFinal(env, weekend, markers?.finalPasses ?? 0);
        break;
      case "qualifying": {
        const raw = await getQualifyingResults(weekend.round);
        const mapped: QualifyingResultEntry[] | null = raw.length > 0 ? mapQualifyingResults(raw) : null;
        if (mapped) {
          await writeColumn(env, weekend.id, "qualifying_json", mapped);
          wrote = true;
        }
        break;
      }
      case "sprint": {
        const raw = await getSprintResults(weekend.round);
        if (raw.length > 0) {
          await writeColumn(env, weekend.id, "sprint_json", mapSprintResults(raw));
          wrote = true;
        }
        break;
      }
      case "sprint_quali": {
        const result = await getSprintQualifyingResults(env, weekend);
        if (result && result.length > 0) {
          await writeColumn(env, weekend.id, "sprint_quali_json", result);
          wrote = true;
        }
        break;
      }
      case "practice":
        wrote = await runPractice(env, weekend, item.practiceType as PracticeType);
        break;
    }
  } catch (err) {
    console.error(`syncRoundResults: ${kind} failed for ${weekend.id} (${errorReason(err)})`);
  }
  return { attempted: true, wrote };
}

/**
 * Точка входа фазы «результаты» (urgent — гонка/квалификация/спринт,
 * background — практики и перепроверки): выбирает самый приоритетный
 * недостающий пункт по всему сезону (активные этапы и старые backfill'ом — одним и тем
 * же правилом) и выполняет его. true — сделана сетевая работа (тяжёлая фаза).
 */
export async function syncNextResultItem(
  env: Env,
  races: RaceWeekend[],
  budget: SubrequestBudget,
  now: Date,
  tier: "urgent" | "background" = "urgent",
): Promise<boolean> {
  const started = races.filter((r) => r.status !== "cancelled" && r.sessions.some((s) => s.status !== "upcoming"));
  if (started.length === 0) return false;

  const [presence, markers] = await Promise.all([loadPresence(env), loadMarkers(env)]);
  const items: WorkItem[] = [];
  for (const weekend of started) {
    const p = presence.get(weekend.id);
    if (!p) continue; // строки этапа ещё нет — её создаст синк календаря
    items.push(...planWorkItems(weekend, p, markers.get(weekend.id) ?? { finalPasses: 0, attemptAt: {} }, now));
  }
  // "urgent" — гонка, квалификация, спринт: то, чего пользователь ждёт
  // прямо сейчас. "background" — практики и контрольные перепроверки
  // гонки: идут после пересчёта стендингов, чтобы не задерживать его.
  const wanted = items.filter((item) => (RANK[item.kind] <= URGENT_MAX_RANK) === (tier === "urgent"));
  items.length = 0;
  items.push(...wanted);

  const best = pickBest(items);
  if (!best) return false;
  const outcome = await runWorkItem(env, best, markers.get(best.weekend.id), budget, now);
  return outcome.attempted;
}
