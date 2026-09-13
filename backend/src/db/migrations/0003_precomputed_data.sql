-- 0003_precomputed_data.sql
-- Переход на модель "cron наполняет D1, запросы читают только из D1".
-- Все таблицы ниже — JSON-блобами на значение (см. бриф): это позволяет
-- переиспользовать уже существующие TypeScript-типы без переписывания
-- формы данных при переносе логики из "живого" фетча в cron.
--
-- Разделение на "auto" (наполняются cron'ом, перезаписываются целиком
-- при каждом обновлении) и "curated" (правятся вручную, cron их не
-- трогает никогда) — намеренное архитектурное решение: cron не должен
-- иметь возможность затереть кураторские данные при merge/upsert.

-- ============================================================
-- AUTO-таблицы (наполняются cron-обработчиком из Jolpica/OpenF1)
-- ============================================================

-- Календарь + все типы результатов по каждому этапу сезона.
-- race_id — используем тот же идентификатор, что отдаёт Jolpica
-- (season+round, например "2026-14"), чтобы не городить свой маппинг.
CREATE TABLE IF NOT EXISTS season_races (
  race_id             TEXT PRIMARY KEY,
  season              INTEGER NOT NULL,
  round               INTEGER NOT NULL,
  circuit_id          TEXT NOT NULL,
  weekend_json        TEXT,            -- расписание сессий, статус этапа
  race_results_json   TEXT,
  qualifying_json     TEXT,            -- Q1/Q2/Q3 как отдельные значения
  sprint_json         TEXT,
  practice_json       TEXT,            -- FP1/FP2/FP3 агрегированные лучшие круги
  sprint_quali_json   TEXT,            -- SQ1/SQ2/SQ3
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_season_races_season ON season_races(season);
CREATE INDEX IF NOT EXISTS idx_season_races_circuit ON season_races(circuit_id);

-- Личный зачёт / кубок конструкторов текущего сезона.
-- type: 'drivers' | 'constructors'
CREATE TABLE IF NOT EXISTS standings_cache (
  type        TEXT NOT NULL,
  season      INTEGER NOT NULL,
  data_json   TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (type, season)
);

-- Карьерная статистика пилотов (победы/подиумы/поулы/очки/титулы/годы).
CREATE TABLE IF NOT EXISTS driver_career (
  driver_id   TEXT PRIMARY KEY,
  data_json   TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- То же самое для конструкторов (без поулов).
CREATE TABLE IF NOT EXISTS constructor_career (
  constructor_id  TEXT PRIMARY KEY,
  data_json       TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- История трассы: год дебюта, число гонок, рекорд круга,
-- самый успешный пилот/команда — всё, что реально считается из Jolpica.
CREATE TABLE IF NOT EXISTS track_history (
  circuit_id  TEXT PRIMARY KEY,
  data_json   TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Цвета команд, live-источник — OpenF1 team_colour.
CREATE TABLE IF NOT EXISTS team_colors (
  constructor_id  TEXT PRIMARY KEY,
  color           TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- ============================================================
-- CURATED-таблицы (правятся вручную, cron НИКОГДА сюда не пишет)
-- ============================================================

-- Курируемый датасет по командам: шасси/мотор/руководитель/база.
-- Составной PK на (constructor_id, season) — сразу закладываем
-- мультисезонность, даже если сейчас реально используется только
-- текущий сезон. Это позволяет в будущем хранить историю смен
-- шасси/принципалов без миграции схемы.
CREATE TABLE IF NOT EXISTS team_details (
  constructor_id  TEXT NOT NULL,
  season          INTEGER NOT NULL,
  chassis         TEXT,
  engine          TEXT,
  principal       TEXT,
  base            TEXT,
  founded_year    INTEGER,
  updated_at      TEXT NOT NULL,
  PRIMARY KEY (constructor_id, season)
);

-- Курируемое описание характера трассы (высокоскоростная/техническая/
-- уличная и т.п.). Составы шин (tyres) и разбивка по секторам (sectors)
-- сознательно НЕ включены в это решение — см. пояснение в чате:
-- составы шин привязаны к конкретному этапу конкретного сезона
-- (Pirelli объявляет их отдельно под каждый Grand Prix), а не к трассе
-- как таковой, и требовали бы ручного обновления 24 раза в год;
-- официального стандарта на "секторы" трассы не существует.
-- Если понадобится — добавить отдельной миграцией, не сюда.
CREATE TABLE IF NOT EXISTS track_curated (
  circuit_id      TEXT PRIMARY KEY,
  characteristics TEXT,
  updated_at      TEXT NOT NULL
);

-- ============================================================
-- Сид: курируемые данные по всем 11 командам сезона 2026
-- Сверено по F1.com / Wikipedia / motorsport.com на 13.09.2026.
-- Принципалы Alpine и Audi указаны как реальная связка двух ролей
-- (официального единоличного team principal у этих двух команд нет).
-- ============================================================

INSERT INTO team_details (constructor_id, season, chassis, engine, principal, base, founded_year, updated_at) VALUES
  ('mclaren',      2026, 'MCL40',    'Mercedes',                    'Andrea Stella',                      'Woking, Великобритания',                         1966, CURRENT_TIMESTAMP),
  ('mercedes',     2026, 'W17',      'Mercedes',                    'Toto Wolff',                          'Brackley, Великобритания',                        2010, CURRENT_TIMESTAMP),
  ('red_bull',     2026, 'RB22',     'Red Bull Powertrains-Ford',   'Laurent Mekies',                      'Milton Keynes, Великобритания',                   2005, CURRENT_TIMESTAMP),
  ('ferrari',      2026, 'SF-26',    'Ferrari',                     'Fred Vasseur',                        'Maranello, Италия',                               1950, CURRENT_TIMESTAMP),
  ('williams',     2026, 'FW48',     'Mercedes',                    'James Vowles',                        'Grove, Великобритания',                           1977, CURRENT_TIMESTAMP),
  ('rb',           2026, 'VCARB 03', 'Red Bull Powertrains-Ford',   'Alan Permane',                        'Faenza, Италия',                                  2006, CURRENT_TIMESTAMP),
  ('aston_martin', 2026, 'AMR26',    'Honda',                       'Adrian Newey',                        'Silverstone, Великобритания',                     2021, CURRENT_TIMESTAMP),
  ('haas',         2026, 'VF-26',    'Ferrari',                     'Ayao Komatsu',                        'Kannapolis, США',                                 2016, CURRENT_TIMESTAMP),
  ('audi',         2026, 'R26',      'Audi',                        'Mattia Binotto (Team Principal); Allan McNish (Racing Director)', 'Hinwil, Швейцария',       2026, CURRENT_TIMESTAMP),
  ('alpine',       2026, 'A526',     'Mercedes',                    'Flavio Briatore (Executive Advisor); Steve Nielsen (Managing Director)', 'Enstone, Великобритания', 2021, CURRENT_TIMESTAMP),
  ('cadillac',     2026, 'MAC-26',   'Ferrari',                     'Marcin Budkowski',                    'Fishers, Indiana, США / Silverstone, Великобритания', 2026, CURRENT_TIMESTAMP);
