import type { Env } from "../env";
import { getUserProfile } from "../lib/userRepository";
import { requireUserId } from "../lib/requireAuth";
import { jsonResponse } from "../lib/http";
import type { BootstrapResponse } from "../types";

export async function handleBootstrap(request: Request, env: Env): Promise<Response> {
  const userId = await requireUserId(request, env);

  const profile = await getUserProfile(env, userId);
  if (!profile) {
    return jsonResponse({ error: "User not found" }, 404);
  }

  // TODO(Этап 2): подставить реальный nextRace из providers/jolpica.ts +
  // cache-слоя (api_cache) вместо null.
  const response: BootstrapResponse = {
    profile,
    nextRace: null,
  };

  return jsonResponse(response);
}
