import { apiFetch } from "./client";
import type { UserPreferences } from "../types/domain";

export interface UpdatePreferencesPayload {
  favoriteDriverId?: string | null;
  favoriteConstructorId?: string | null;
}

export async function updatePreferences(payload: UpdatePreferencesPayload): Promise<{ preferences: UserPreferences }> {
  return apiFetch<{ preferences: UserPreferences }>("/preferences", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
