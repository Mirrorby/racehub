import type { Env } from "../env";
import { errorResponse, jsonResponse } from "../lib/http";
import { getRaceDetail } from "../services/raceDetailService";

export async function handleRaceDetail(_request: Request, env: Env, id: string): Promise<Response> {
  const detail = await getRaceDetail(env, id);
  if (!detail) {
    return errorResponse("Race not found", 404);
  }
  return jsonResponse(detail);
}
