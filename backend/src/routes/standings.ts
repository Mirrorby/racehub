import type { Env } from "../env";
import { errorResponse, jsonResponse } from "../lib/http";
import type { Standing, StandingsResponse, StandingsType } from "../types";

interface StandingsRow {
  season: number;
  data_json: string;
}

/**
 * Раньше здесь на каждый запрос пробовался OpenF1 fast-path с фолбэком на
 * Jolpica (routes/standings.ts::tryFastStandings) — та же логика теперь
 * живёт в cron (см. cron/syncCalendarAndStandings.ts, которая уже вплетает
 * live-цвета команд), а роут просто отдаёт последний посчитанный снимок.
 */
export async function handleStandings(request: Request, env: Env, type: string): Promise<Response> {
  if (type !== "drivers" && type !== "constructors") {
    return errorResponse("type must be 'drivers' or 'constructors'", 400);
  }
  const standingsType = type as StandingsType;

  const row = await env.DB.prepare(
    "SELECT season, data_json FROM standings_cache WHERE type = ? ORDER BY updated_at DESC LIMIT 1",
  )
    .bind(standingsType)
    .first<StandingsRow>();

  if (!row) {
    // Самый первый холодный старт, до первого тика cron — честно отдаём
    // пустой список вместо 404/500: экран standings умеет показывать
    // пустое состояние, а данные появятся в течение 15 минут.
    const empty: StandingsResponse = { season: new Date().getUTCFullYear(), type: standingsType, standings: [] };
    return jsonResponse(empty);
  }

  const standings = JSON.parse(row.data_json) as Standing[];
  const body: StandingsResponse = { season: row.season, type: standingsType, standings };
  return jsonResponse(body);
}
