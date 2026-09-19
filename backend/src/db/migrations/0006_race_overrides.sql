-- 0006_race_overrides.sql
-- Курируемая пометка "гонка/уик-энд отменён" — Jolpica не отдаёт такого
-- сигнала в принципе (Ergast-подобные API просто не публикуют результаты
-- для не состоявшейся сессии, что неотличимо от "ещё не началась" или
-- "результаты не подъехали"). Автоматически детектировать отмену
-- невозможно — вносится вручную, когда об этом стало известно из новостей.
-- AUTO-таблицы (season_races и т.д.) cron перезаписывает целиком при
-- каждом обновлении календаря — эта таблица, как team_details/
-- track_curated, cron не трогает никогда, читается отдельным запросом на
-- чтении (см. calendarService.ts/raceDetailService.ts).
CREATE TABLE IF NOT EXISTS race_overrides (
  race_id     TEXT PRIMARY KEY,
  cancelled   INTEGER NOT NULL DEFAULT 0,
  note        TEXT,
  updated_at  TEXT NOT NULL
);
