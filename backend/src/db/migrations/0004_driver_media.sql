-- 0004_driver_media.sql
-- Фото пилотов — единственный источник через API: OpenF1 /drivers отдаёт
-- headshot_url (прямая ссылка на CDN Formula1.com). Jolpica медиа не
-- отдаёт вообще. AUTO-таблица (наполняется cron'ом, см.
-- cron/syncEntityRoundRobin.ts), НЕ curated — в отличие от team_details/
-- track_curated, здесь нечего вести вручную, только зеркалим то, что
-- отдаёт OpenF1.
CREATE TABLE IF NOT EXISTS driver_media (
  driver_id     TEXT PRIMARY KEY,
  headshot_url  TEXT,
  updated_at    TEXT NOT NULL
);
