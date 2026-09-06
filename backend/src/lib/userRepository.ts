import type { Env } from "../env";
import type { TelegramUser } from "./telegramAuth";
import type { NotificationSettings, UserPreferences, UserProfile } from "../types";

interface UserRow {
  id: string;
  telegram_user_id: number;
  timezone: string;
  onboarding_completed: number;
}

interface PreferencesRow {
  favorite_driver_id: string | null;
  favorite_constructor_id: string | null;
  theme_mode: UserPreferences["themeMode"];
  time_format: UserPreferences["timeFormat"];
}

interface NotificationSettingsRow {
  enabled: number;
  race_enabled: number;
  race_minutes_before: number;
  qualifying_enabled: number;
  qualifying_minutes_before: number;
  sprint_enabled: number;
  sprint_minutes_before: number;
  practice_enabled: number;
  practice_minutes_before: number;
  results_enabled: number;
  favorite_driver_result_enabled: number;
  championship_change_enabled: number;
}

/**
 * Находит пользователя по telegram_user_id либо создаёт нового вместе с
 * дефолтными preferences/notification_settings (ТЗ раздел 11).
 * Возвращает { userId, isNewUser }.
 */
export async function findOrCreateUser(
  env: Env,
  telegramUser: TelegramUser,
): Promise<{ userId: string; isNewUser: boolean }> {
  const existing = await env.DB.prepare("SELECT id FROM users WHERE telegram_user_id = ?")
    .bind(telegramUser.id)
    .first<{ id: string }>();

  if (existing) {
    await env.DB.prepare(
      "UPDATE users SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), telegram_username = ?, first_name = ?, last_name = ?, language_code = ? WHERE id = ?",
    )
      .bind(
        telegramUser.username ?? null,
        telegramUser.first_name ?? null,
        telegramUser.last_name ?? null,
        telegramUser.language_code ?? null,
        existing.id,
      )
      .run();
    return { userId: existing.id, isNewUser: false };
  }

  const userId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id, telegram_user_id, telegram_username, first_name, last_name, language_code) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      userId,
      telegramUser.id,
      telegramUser.username ?? null,
      telegramUser.first_name ?? null,
      telegramUser.last_name ?? null,
      telegramUser.language_code ?? null,
    ),
    env.DB.prepare("INSERT INTO user_preferences (user_id, theme_mode, time_format) VALUES (?, 'telegram', '24h')").bind(
      userId,
    ),
    env.DB.prepare("INSERT INTO notification_settings (user_id) VALUES (?)").bind(userId),
  ]);

  return { userId, isNewUser: true };
}

export async function updateUserPreferences(
  env: Env,
  userId: string,
  patch: { favoriteDriverId?: string | null; favoriteConstructorId?: string | null },
): Promise<UserPreferences> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (patch.favoriteDriverId !== undefined) {
    sets.push("favorite_driver_id = ?");
    values.push(patch.favoriteDriverId);
  }
  if (patch.favoriteConstructorId !== undefined) {
    sets.push("favorite_constructor_id = ?");
    values.push(patch.favoriteConstructorId);
  }

  if (sets.length > 0) {
    sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    values.push(userId);
    await env.DB.prepare(`UPDATE user_preferences SET ${sets.join(", ")} WHERE user_id = ?`)
      .bind(...values)
      .run();
  }

  const row = await env.DB.prepare(
    "SELECT favorite_driver_id, favorite_constructor_id, theme_mode, time_format FROM user_preferences WHERE user_id = ?",
  )
    .bind(userId)
    .first<PreferencesRow>();

  return {
    favoriteDriverId: row?.favorite_driver_id ?? null,
    favoriteConstructorId: row?.favorite_constructor_id ?? null,
    themeMode: row?.theme_mode ?? "telegram",
    timeFormat: row?.time_format ?? "24h",
  };
}

export async function getUserProfile(env: Env, userId: string): Promise<UserProfile | null> {
  const userRow = await env.DB.prepare("SELECT id, telegram_user_id, timezone, onboarding_completed FROM users WHERE id = ?")
    .bind(userId)
    .first<UserRow>();
  if (!userRow) return null;

  const prefsRow = await env.DB.prepare(
    "SELECT favorite_driver_id, favorite_constructor_id, theme_mode, time_format FROM user_preferences WHERE user_id = ?",
  )
    .bind(userId)
    .first<PreferencesRow>();

  const notifRow = await env.DB.prepare(
    `SELECT enabled, race_enabled, race_minutes_before, qualifying_enabled, qualifying_minutes_before,
            sprint_enabled, sprint_minutes_before, practice_enabled, practice_minutes_before,
            results_enabled, favorite_driver_result_enabled, championship_change_enabled
     FROM notification_settings WHERE user_id = ?`,
  )
    .bind(userId)
    .first<NotificationSettingsRow>();

  const preferences: UserPreferences = {
    favoriteDriverId: prefsRow?.favorite_driver_id ?? null,
    favoriteConstructorId: prefsRow?.favorite_constructor_id ?? null,
    themeMode: prefsRow?.theme_mode ?? "telegram",
    timeFormat: prefsRow?.time_format ?? "24h",
  };

  const notificationSettings: NotificationSettings = {
    enabled: Boolean(notifRow?.enabled ?? 1),
    raceEnabled: Boolean(notifRow?.race_enabled ?? 1),
    raceMinutesBefore: notifRow?.race_minutes_before ?? 60,
    qualifyingEnabled: Boolean(notifRow?.qualifying_enabled ?? 1),
    qualifyingMinutesBefore: notifRow?.qualifying_minutes_before ?? 30,
    sprintEnabled: Boolean(notifRow?.sprint_enabled ?? 1),
    sprintMinutesBefore: notifRow?.sprint_minutes_before ?? 30,
    practiceEnabled: Boolean(notifRow?.practice_enabled ?? 0),
    practiceMinutesBefore: notifRow?.practice_minutes_before ?? 15,
    resultsEnabled: Boolean(notifRow?.results_enabled ?? 1),
    favoriteDriverResultEnabled: Boolean(notifRow?.favorite_driver_result_enabled ?? 1),
    championshipChangeEnabled: Boolean(notifRow?.championship_change_enabled ?? 0),
  };

  return {
    id: userRow.id,
    timezone: userRow.timezone,
    onboardingCompleted: Boolean(userRow.onboarding_completed),
    preferences,
    notificationSettings,
  };
}
