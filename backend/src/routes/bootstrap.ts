import type { Env } from "../env";
import { errorReason } from "../lib/errors";
import { getUserProfile } from "../lib/userRepository";
import { requireUserId } from "../lib/requireAuth";
import { errorResponse, jsonResponse } from "../lib/http";
import { getNextRaceWeekend } from "../services/calendarService";
import type { BootstrapResponse } from "../types";

export async function handleBootstrap(request: Request, env: Env): Promise<Response> {
  const userId = await requireUserId(request, env);

  const profile = await getUserProfile(env, userId);
  if (!profile) {
    return errorResponse("User not found", 404);
  }

  let nextRace: BootstrapResponse["nextRace"] = null;
  try {
    nextRace = await getNextRaceWeekend(env);
  } catch (err) {
    // getNextRaceWeekend теперь читает только D1 (см. calendarService.ts) —
    // единственная причина упасть здесь это сбой самой D1 или ещё не
    // распарсенный weekend_json. Не роняем весь bootstrap/логин из-за
    // этого, просто отдаём без nextRace.
    console.error(`Failed to resolve nextRace (${errorReason(err)}), falling back to null`);
  }

  const response: BootstrapResponse = { profile, nextRace };

  return jsonResponse(response);
}
