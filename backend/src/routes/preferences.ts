import type { Env } from "../env";
import { requireUserId } from "../lib/requireAuth";
import { errorResponse, jsonResponse } from "../lib/http";
import { updateUserPreferences } from "../lib/userRepository";

interface PreferencesPatch {
  favoriteDriverId?: string | null;
  favoriteConstructorId?: string | null;
}

function isValidPatchField(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

export async function handleUpdatePreferences(request: Request, env: Env): Promise<Response> {
  const userId = await requireUserId(request, env);

  let body: PreferencesPatch;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  if (!isValidPatchField(body.favoriteDriverId) || !isValidPatchField(body.favoriteConstructorId)) {
    return errorResponse("favoriteDriverId/favoriteConstructorId must be a string or null", 400);
  }

  const preferences = await updateUserPreferences(env, userId, body);
  return jsonResponse({ preferences });
}
