import type { Env } from "../env";
import { requireUserId } from "../lib/requireAuth";
import { errorResponse, jsonResponse } from "../lib/http";
import { updateNotificationSettings } from "../lib/userRepository";
import type { NotificationSettings } from "../types";

const BOOLEAN_FIELDS: Array<keyof NotificationSettings> = [
  "enabled",
  "raceEnabled",
  "qualifyingEnabled",
  "sprintEnabled",
  "practiceEnabled",
  "resultsEnabled",
  "favoriteDriverResultEnabled",
  "championshipChangeEnabled",
];

const MINUTES_FIELDS: Array<keyof NotificationSettings> = [
  "raceMinutesBefore",
  "qualifyingMinutesBefore",
  "sprintMinutesBefore",
  "practiceMinutesBefore",
];

function validatePatch(body: Record<string, unknown>): string | null {
  for (const field of BOOLEAN_FIELDS) {
    if (body[field] !== undefined && typeof body[field] !== "boolean") {
      return `${field} must be a boolean`;
    }
  }
  for (const field of MINUTES_FIELDS) {
    const value = body[field];
    if (value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1440)) {
      return `${field} must be an integer between 0 and 1440`;
    }
  }
  return null;
}

export async function handleUpdateNotificationSettings(request: Request, env: Env): Promise<Response> {
  const userId = await requireUserId(request, env);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const validationError = validatePatch(body);
  if (validationError) {
    return errorResponse(validationError, 400);
  }

  const settings = await updateNotificationSettings(env, userId, body as Partial<NotificationSettings>);
  return jsonResponse({ notificationSettings: settings });
}
