import { apiFetch } from "./client";
import type { NotificationSettings } from "../types/domain";

export type UpdateNotificationSettingsPayload = Partial<NotificationSettings>;

export async function updateNotificationSettings(
  payload: UpdateNotificationSettingsPayload,
): Promise<{ notificationSettings: NotificationSettings }> {
  return apiFetch<{ notificationSettings: NotificationSettings }>("/notifications/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
