import type { Env } from "../env";

/**
 * Тонкая обёртка над таблицей app_state (см. db/schema.sql) под служебное
 * состояние cron между тиками — курсоры циклического обхода, таймстемпы
 * последней синхронизации и т.п. Не путать с api_cache — это не TTL-кэш
 * ответа апстрима, а собственная память приложения (та же таблица, что
 * уже используется notifications/resultNotifications.ts под лидера
 * чемпионата).
 */
export async function getAppState(env: Env, key: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT value FROM app_state WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setAppState(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
    .bind(key, value)
    .run();
}

/** true, если `${key}:synced_at` отсутствует или старше maxAgeMs. */
export async function isStale(env: Env, key: string, maxAgeMs: number, now: Date = new Date()): Promise<boolean> {
  const stored = await getAppState(env, `${key}:synced_at`);
  if (!stored) return true;
  return now.getTime() - new Date(stored).getTime() >= maxAgeMs;
}

export async function markSynced(env: Env, key: string, now: Date = new Date()): Promise<void> {
  await setAppState(env, `${key}:synced_at`, now.toISOString());
}
