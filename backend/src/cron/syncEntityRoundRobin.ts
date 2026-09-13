import type { Env } from "../env";
import { errorReason } from "../lib/errors";
import { getAppState, setAppState } from "./appState";
import { getDriverCareerStats, getConstructorCareerStats } from "../services/careerStatsService";
import { getTrackHistory } from "../services/trackHistoryService";
import { getLiveTeamColors } from "../services/liveResultsService";
import type { RaceWeekend, Standing } from "../types";
import type { SubrequestBudget } from "./subrequestBudget";

const CURSOR_KEY = "entity_sync_cursor";
// Резервируем с запасом на худший случай: постраничная агрегация карьеры
// пилота с длинной историей (результаты + поулы + цикл по сезонам ради
// титулов) может стоить несколько десятков подзапросов при холодном
// кэше. Если бюджета настолько не хватает — просто не трогаем курсор и
// пробуем этот же элемент очереди на следующем тике.
const MIN_BUDGET_FOR_ENTITY = 40;

interface EntityRef {
  kind: "driver" | "constructor" | "circuit" | "team_colors";
  id: string;
}

interface StandingsRow {
  data_json: string;
}

interface CircuitRow {
  circuit_id: string;
}

async function buildEntityQueue(env: Env): Promise<EntityRef[]> {
  const queue: EntityRef[] = [];

  const driverRow = await env.DB.prepare(
    "SELECT data_json FROM standings_cache WHERE type = 'drivers' ORDER BY updated_at DESC LIMIT 1",
  ).first<StandingsRow>();
  if (driverRow) {
    const standings = JSON.parse(driverRow.data_json) as Standing[];
    for (const s of standings) {
      if (s.driver?.id) queue.push({ kind: "driver", id: s.driver.id });
    }
  }

  const constructorRow = await env.DB.prepare(
    "SELECT data_json FROM standings_cache WHERE type = 'constructors' ORDER BY updated_at DESC LIMIT 1",
  ).first<StandingsRow>();
  if (constructorRow) {
    const standings = JSON.parse(constructorRow.data_json) as Standing[];
    for (const s of standings) {
      if (s.constructor?.id) queue.push({ kind: "constructor", id: s.constructor.id });
    }
  }

  const circuitRows = await env.DB.prepare("SELECT DISTINCT circuit_id FROM season_races").all<CircuitRow>();
  for (const row of circuitRows.results ?? []) {
    queue.push({ kind: "circuit", id: row.circuit_id });
  }

  // Цвета команд — один общий элемент очереди, не по команде отдельно:
  // getLiveTeamColors одним проходом возвращает карту сразу по всем
  // constructorId с последней прошедшей сессии сезона.
  queue.push({ kind: "team_colors", id: "*" });

  return queue;
}

function findLatestStartedRace(races: RaceWeekend[], now: Date): RaceWeekend | null {
  for (let i = races.length - 1; i >= 0; i--) {
    const raceSession = races[i].sessions.find((s) => s.type === "race");
    if (raceSession && new Date(raceSession.startUtc) <= now) return races[i];
  }
  return null;
}

/**
 * Раз за тик считает и сохраняет ОДНУ сущность из очереди (карьера
 * пилота/команды, история трассы, либо разом все цвета команд), сдвигая
 * циклический курсор в app_state. При ~35-40 элементах очереди и тике раз
 * в 15 минут это даёт полный цикл обновления примерно за 9-10 часов — с
 * запасом чаще, чем "раз в сутки" из брифа, и без риска тратить весь
 * бюджет одного тика на тяжёлую агрегацию сразу по всем сущностям разом.
 *
 * Переиспользует существующие careerStatsService/trackHistoryService —
 * они уже кэшируют результат в api_cache (TTL 12-24ч), так что при
 * повторном попадании курсора на уже недавно посчитанную сущность
 * реальных сетевых запросов не будет вовсе, а бюджет останется
 * нетронутым для остальных фаз тика.
 */
export async function syncNextEntity(env: Env, races: RaceWeekend[], budget: SubrequestBudget): Promise<void> {
  if (budget.left < MIN_BUDGET_FOR_ENTITY) {
    console.log(`syncNextEntity: not enough budget (${budget.left}), skipping this tick`);
    return;
  }

  const queue = await buildEntityQueue(env);
  if (queue.length === 0) return;

  const cursorRaw = await getAppState(env, CURSOR_KEY);
  const cursor = cursorRaw ? Number(cursorRaw) % queue.length : 0;
  const entity = queue[cursor];
  const nowIso = new Date().toISOString();

  try {
    if (entity.kind === "driver") {
      const stats = await getDriverCareerStats(env, entity.id);
      if (stats) {
        await env.DB.prepare(
          `INSERT INTO driver_career (driver_id, data_json, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(driver_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
        )
          .bind(entity.id, JSON.stringify(stats), nowIso)
          .run();
      }
    } else if (entity.kind === "constructor") {
      const stats = await getConstructorCareerStats(env, entity.id);
      if (stats) {
        await env.DB.prepare(
          `INSERT INTO constructor_career (constructor_id, data_json, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(constructor_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
        )
          .bind(entity.id, JSON.stringify(stats), nowIso)
          .run();
      }
    } else if (entity.kind === "circuit") {
      const history = await getTrackHistory(env, entity.id);
      if (history) {
        await env.DB.prepare(
          `INSERT INTO track_history (circuit_id, data_json, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(circuit_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
        )
          .bind(entity.id, JSON.stringify(history), nowIso)
          .run();
      }
    } else {
      const latestRace = findLatestStartedRace(races, new Date());
      const colors = await getLiveTeamColors(env, latestRace);
      for (const [constructorId, color] of colors.entries()) {
        await env.DB.prepare(
          `INSERT INTO team_colors (constructor_id, color, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(constructor_id) DO UPDATE SET color = excluded.color, updated_at = excluded.updated_at`,
        )
          .bind(constructorId, color, nowIso)
          .run();
      }
    }
  } catch (err) {
    console.error(`syncNextEntity: failed for ${entity.kind}:${entity.id} (${errorReason(err)})`);
  }

  await setAppState(env, CURSOR_KEY, String((cursor + 1) % queue.length));
}
