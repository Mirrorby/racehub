import type { Env } from "../env";
import { jsonResponse } from "../lib/http";
import { getSeasonCalendar } from "../services/calendarService";
import type { CalendarResponse } from "../types";

export async function handleCalendar(_request: Request, env: Env): Promise<Response> {
  const { season, races } = await getSeasonCalendar(env);
  const body: CalendarResponse = { season, races };
  return jsonResponse(body);
}
