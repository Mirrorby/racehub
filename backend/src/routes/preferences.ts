import type { Env } from "../env";
import { requireUserId } from "../lib/requireAuth";
import { errorResponse, jsonResponse } from "../lib/http";
import { updateUserPreferences } from "../lib/userRepository";

interface PreferencesPatch {
  favoriteDriverId?: string | null;
  favoriteDriver2Id?: string | null;
  favoriteConstructorId?: string | null;
  language?: "en" | "ru";
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

  if (!isValidPatchField(body.favoriteDriverId) || !isValidPatchField(body.favoriteDriver2Id) || !isValidPatchField(body.favoriteConstructorId)) {
    return errorResponse("Favourite ids must be a string or null", 400);
  }
  if (body.language !== undefined && body.language !== "en" && body.language !== "ru") {
    return errorResponse("language must be en or ru", 400);
  }

  const preferences = await updateUserPreferences(env, userId, body);
  return jsonResponse({ preferences });
}
