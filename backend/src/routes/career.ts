import type { Env } from "../env";
import { errorResponse, jsonResponse } from "../lib/http";
import { getDriverCareerStats, getConstructorCareerStats } from "../services/careerStatsService";
import { getTrackHistory } from "../services/trackHistoryService";

export async function handleDriverCareer(_request: Request, env: Env, driverId: string): Promise<Response> {
  const stats = await getDriverCareerStats(env, driverId);
  if (!stats) return errorResponse("Driver not found", 404);
  return jsonResponse(stats);
}

export async function handleConstructorCareer(_request: Request, env: Env, constructorId: string): Promise<Response> {
  const stats = await getConstructorCareerStats(env, constructorId);
  if (!stats) return errorResponse("Constructor not found", 404);
  return jsonResponse(stats);
}

export async function handleTrackHistory(_request: Request, env: Env, circuitId: string): Promise<Response> {
  const history = await getTrackHistory(env, circuitId);
  if (!history) return errorResponse("Circuit not found", 404);
  return jsonResponse(history);
}
