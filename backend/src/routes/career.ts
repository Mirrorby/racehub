import type { Env } from "../env";
import { errorResponse, jsonResponse } from "../lib/http";
import type { ConstructorCareerStats, DriverCareerStats, TrackHistory } from "../types";

interface DataRow {
  data_json: string;
}

type PrecomputedTable = "driver_career" | "constructor_career" | "track_history";
const ID_COLUMN: Record<PrecomputedTable, string> = {
  driver_career: "driver_id",
  constructor_career: "constructor_id",
  track_history: "circuit_id",
};

/**
 * Раньше эти три роута считали статистику "на лету" — постраничный
 * перебор результатов/квалификаций + цикл по сезонам ради титулов, это
 * десятки живых запросов к Jolpica на один заход в карточку пилота/
 * команды/трассы (см. services/careerStatsService.ts,
 * services/trackHistoryService.ts — они никуда не делись, но теперь
 * вызываются только из cron, см. cron/syncEntityRoundRobin.ts). Здесь —
 * простое чтение уже посчитанной строки.
 */
async function readPrecomputed<T>(env: Env, table: PrecomputedTable, id: string): Promise<T | null> {
  const row = await env.DB.prepare(`SELECT data_json FROM ${table} WHERE ${ID_COLUMN[table]} = ?`).bind(id).first<DataRow>();
  return row ? (JSON.parse(row.data_json) as T) : null;
}

interface TeamDetailsRow {
  chassis: string | null;
  engine: string | null;
  principal: string | null;
  base: string | null;
}

interface TrackCuratedRow {
  characteristics: string | null;
}

export async function handleDriverCareer(_request: Request, env: Env, driverId: string): Promise<Response> {
  const stats = await readPrecomputed<DriverCareerStats>(env, "driver_career", driverId);
  if (!stats) return errorResponse("Driver not found", 404);
  return jsonResponse(stats);
}

export async function handleConstructorCareer(_request: Request, env: Env, constructorId: string): Promise<Response> {
  const stats = await readPrecomputed<ConstructorCareerStats>(env, "constructor_career", constructorId);
  if (!stats) return errorResponse("Constructor not found", 404);

  // Курируемый датасет (chassis/engine/principal/base) — берём самый
  // свежий сезон, заведённый для этой команды. Отдельная таблица,
  // которую cron никогда не трогает (см. db/migrations/0003), поэтому
  // её отсутствие — норма, а не ошибка, если ещё не завели вручную.
  const details = await env.DB.prepare(
    "SELECT chassis, engine, principal, base FROM team_details WHERE constructor_id = ? ORDER BY season DESC LIMIT 1",
  )
    .bind(constructorId)
    .first<TeamDetailsRow>();

  const body: ConstructorCareerStats = {
    ...stats,
    chassis: details?.chassis ?? null,
    engine: details?.engine ?? null,
    principal: details?.principal ?? null,
    base: details?.base ?? null,
  };
  return jsonResponse(body);
}

export async function handleTrackHistory(_request: Request, env: Env, circuitId: string): Promise<Response> {
  const history = await readPrecomputed<TrackHistory>(env, "track_history", circuitId);
  if (!history) return errorResponse("Circuit not found", 404);

  const curated = await env.DB.prepare("SELECT characteristics FROM track_curated WHERE circuit_id = ?")
    .bind(circuitId)
    .first<TrackCuratedRow>();

  const body: TrackHistory = { ...history, characteristics: curated?.characteristics ?? null };
  return jsonResponse(body);
}
