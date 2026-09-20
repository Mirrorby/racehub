import type { Env } from "../env";
import { errorReason } from "../lib/errors";
import { sleep } from "../lib/pace";
import { getAppState, setAppState } from "./appState";
import * as jolpica from "../providers/jolpica";
import type { SubrequestBudget } from "./subrequestBudget";

// Ни один пилот/команда в истории F1 не участвовали больше ~20 сезонов —
// 25 запас на будущее. Раньше это была граница ОДНОГО вызова (до 25
// последовательных запросов сразу); теперь это просто верхняя граница
// того, сколько сезонов вообще может понадобиться проверить за всю жизнь
// конвейера по одной сущности, растянутая на много тиков (см. ниже).
const MAX_SEASONS_FOR_TITLES = 25;
// Сколько сезонов проверяем ЗА ОДИН ТИК — тот самый параметр, что решает
// исходную проблему: даже с учётом retry в fetchJson (до 4 подзапросов на
// вызов при 429/5xx, см. providers/jolpica.ts) шесть сезонов — это не
// больше 24 подзапросов за тик на эту фазу, что укладывается в бюджет
// с большим запасом независимо от того, Bundled аккаунт или Unbound.
const SEASONS_PER_TICK = 6;

interface Progress {
  checkedSeasons: number[];
  championships: number;
}

interface PendingRow {
  id: string;
}

async function findPendingDriver(env: Env): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT driver_id AS id FROM driver_career WHERE json_extract(data_json, '$.championships') IS NULL LIMIT 1",
  ).first<PendingRow>();
  return row?.id ?? null;
}

async function findPendingConstructor(env: Env): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT constructor_id AS id FROM constructor_career WHERE json_extract(data_json, '$.championships') IS NULL LIMIT 1",
  ).first<PendingRow>();
  return row?.id ?? null;
}

async function processEntity(
  env: Env,
  kind: "driver" | "constructor",
  id: string,
  table: "driver_career" | "constructor_career",
  idColumn: "driver_id" | "constructor_id",
  getSeasons: () => Promise<number[]>,
  getPosition: (season: number) => Promise<number | null>,
): Promise<void> {
  const progressKey = `titles:${kind}:${id}`;
  const progressRaw = await getAppState(env, progressKey);
  const progress: Progress = progressRaw ? JSON.parse(progressRaw) : { checkedSeasons: [], championships: 0 };

  const allSeasons = (await getSeasons()).slice(0, MAX_SEASONS_FOR_TITLES);
  const remaining = allSeasons.filter((s) => !progress.checkedSeasons.includes(s));
  const batch = remaining.slice(0, SEASONS_PER_TICK);

  for (const season of batch) {
    await sleep();
    const position = await getPosition(season);
    if (position === 1) progress.championships += 1;
    progress.checkedSeasons.push(season);
  }

  const stillRemaining = allSeasons.filter((s) => !progress.checkedSeasons.includes(s));
  const nowIso = new Date().toISOString();

  if (stillRemaining.length === 0) {
    // Готово — пишем итоговое число прямо в уже сохранённую строку через
    // json_set, не трогая остальные поля и не перечитывая их в JS.
    await env.DB.prepare(
      `UPDATE ${table} SET data_json = json_set(data_json, '$.championships', ?), updated_at = ? WHERE ${idColumn} = ?`,
    )
      .bind(progress.championships, nowIso, id)
      .run();
    // Прогресс больше не нужен — перезаписываем на пустое значение, а не
    // удаляем: app_state не даёт DELETE через текущий набор хелперов, и
    // это не создаёт проблем — findPending* больше не выберет эту
    // сущность, раз championships уже не null.
    await setAppState(env, progressKey, JSON.stringify({ checkedSeasons: [], championships: 0 }));
    console.log(`syncTitleProgress: ${kind}:${id} done (${progress.championships} titles across ${allSeasons.length} seasons)`);
  } else {
    await setAppState(env, progressKey, JSON.stringify(progress));
    console.log(
      `syncTitleProgress: ${kind}:${id} progress ${progress.checkedSeasons.length}/${allSeasons.length} seasons, continuing next tick`,
    );
  }
}

const LAST_KIND_KEY = "titles_last_kind";

/**
 * Раньше здесь всегда сначала проверялся пилот и только при ПОЛНОМ
 * отсутствии должников-пилотов очередь доходила до конструкторов. Пока
 * пилотов-должников было много (а из-за бага перезаписи championships —
 * см. cron/syncEntityRoundRobin.ts, исправлено 19.09.2026 — их было
 * почти всегда 13 из 22), конструкторы НИ РАЗУ не получали тик: по факту
 * в проде на 20.09.2026 — driver_career дожат до 21/22, а
 * constructor_career так и остался 0/11 (championships), хотя остальная
 * их статистика (wins и т.п.) свежая и верная — просто титулам ни разу
 * не выпала очередь. Обнаружено при плановой сверке БД. Теперь строго
 * чередуем: кто не выбирался последним, тот и в приоритете на этот тик.
 */
async function pickNextPending(env: Env): Promise<{ kind: "driver" | "constructor"; id: string } | null> {
  const lastKind = await getAppState(env, LAST_KIND_KEY);
  const preferred: "driver" | "constructor" = lastKind === "driver" ? "constructor" : "driver";
  const other: "driver" | "constructor" = preferred === "driver" ? "constructor" : "driver";

  const preferredId = preferred === "driver" ? await findPendingDriver(env) : await findPendingConstructor(env);
  if (preferredId) return { kind: preferred, id: preferredId };

  const otherId = other === "driver" ? await findPendingDriver(env) : await findPendingConstructor(env);
  if (otherId) return { kind: other, id: otherId };

  return null;
}

/**
 * Титулы пилота/команды считаются по сезонам ("кто был первым в
 * standings того сезона") отдельно от остальной карьерной статистики
 * (wins/podiums/poles/points — те считаются в careerStatsService.ts,
 * там же объяснение, почему подсчёт разнесён на два конвейера). Каждый
 * тик обрабатывает ОДНУ сущность и не больше SEASONS_PER_TICK сезонов
 * для неё, сохраняя прогресс в app_state между тиками. Само-
 * восстанавливается запросом "у кого championships ещё null" — как
 * backfillOlderRounds для раундов, а не ручным курсором: упавший на
 * середине тик просто продолжится с того же места на следующем.
 */
export async function syncTitleProgress(env: Env, budget: SubrequestBudget): Promise<void> {
  // SEASONS_PER_TICK + запас на entitySeasons (обычно из api_cache, но не
  // гарантированно) + запас на retry.
  if (!budget.tryConsume(SEASONS_PER_TICK + 2)) return;

  try {
    const pending = await pickNextPending(env);
    if (!pending) return;

    if (pending.kind === "driver") {
      await processEntity(
        env,
        "driver",
        pending.id,
        "driver_career",
        "driver_id",
        () => jolpica.getEntitySeasons(`/drivers/${pending.id}`),
        (season) => jolpica.getDriverSeasonPosition(season, pending.id),
      );
    } else {
      await processEntity(
        env,
        "constructor",
        pending.id,
        "constructor_career",
        "constructor_id",
        () => jolpica.getEntitySeasons(`/constructors/${pending.id}`),
        (season) => jolpica.getConstructorSeasonPosition(season, pending.id),
      );
    }
    await setAppState(env, LAST_KIND_KEY, pending.kind);
  } catch (err) {
    console.error(`syncTitleProgress: failed (${errorReason(err)})`);
  }
}
