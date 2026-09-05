-- Race Hub — D1 schema (Cloudflare)
-- Соответствует моделям данных из ТЗ (раздел 11: Users & preferences).
-- Данные календаря/результатов/зачётов на Этапе 1 НЕ хранятся —
-- они кэшируются отдельным cache-слоем (KV или таблица api_cache), см. Этап 2.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                 -- внутренний uuid
  telegram_user_id INTEGER NOT NULL UNIQUE,
  telegram_username TEXT,
  first_name TEXT,
  last_name TEXT,
  language_code TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  onboarding_completed INTEGER NOT NULL DEFAULT 0, -- boolean 0/1
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_user_id ON users (telegram_user_id);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  favorite_driver_id TEXT,
  favorite_constructor_id TEXT,
  theme_mode TEXT NOT NULL DEFAULT 'telegram',  -- telegram | light | dark
  time_format TEXT NOT NULL DEFAULT '24h',      -- 24h | 12h
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS notification_settings (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1,
  race_enabled INTEGER NOT NULL DEFAULT 1,
  race_minutes_before INTEGER NOT NULL DEFAULT 60,
  qualifying_enabled INTEGER NOT NULL DEFAULT 1,
  qualifying_minutes_before INTEGER NOT NULL DEFAULT 30,
  sprint_enabled INTEGER NOT NULL DEFAULT 1,
  sprint_minutes_before INTEGER NOT NULL DEFAULT 30,
  practice_enabled INTEGER NOT NULL DEFAULT 0,
  practice_minutes_before INTEGER NOT NULL DEFAULT 15,
  results_enabled INTEGER NOT NULL DEFAULT 1,
  favorite_driver_result_enabled INTEGER NOT NULL DEFAULT 1,
  championship_change_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Лог отправленных уведомлений — не даёт слать дубликаты при повторном
-- срабатывании cron / retry (ТЗ: уведомления должны быть идемпотентны).
CREATE TABLE IF NOT EXISTS notification_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  notification_key TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, notification_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log (user_id);

-- Сессионные токены (Этап 1: простая серверная сессия поверх initData,
-- не JWT, чтобы можно было мгновенно инвалидировать при необходимости).
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- Универсальный cache-слой для нормализованных ответов провайдера
-- (ТЗ раздел 9: TTL-кэш + single-flight refresh + stale fallback).
-- Заполняется на Этапе 2 вместе с providers/jolpica.ts.
CREATE TABLE IF NOT EXISTS api_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
