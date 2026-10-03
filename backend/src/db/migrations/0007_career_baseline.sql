-- career_baseline: исторические карьерные итоги ДО сезона 2026 (включительно по 2025).
-- Источник: F1DB (CC BY 4.0), сгенерировано scripts/build_career_baseline.py.
-- Текущий сезон дописывается из season_races в cron/syncCareerFromResults.ts.
CREATE TABLE IF NOT EXISTS career_baseline (
  kind TEXT NOT NULL CHECK (kind IN ('driver', 'constructor')),
  entity_id TEXT NOT NULL,
  through_season INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  podiums INTEGER NOT NULL,
  poles INTEGER NOT NULL DEFAULT 0,
  points REAL NOT NULL,
  championships INTEGER NOT NULL,
  first_season INTEGER,
  last_season INTEGER,
  source TEXT NOT NULL,
  PRIMARY KEY (kind, entity_id)
);

INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'albon', 2025, 0, 2, 0, 313, 0, 2019, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'alonso', 2025, 32, 106, 22, 2393, 2, 2001, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'antonelli', 2025, 0, 3, 0, 150, 0, 2025, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'arvid_lindblad', 2025, 0, 0, 0, 0, 0, NULL, NULL, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'bearman', 2025, 0, 0, 0, 48, 0, 2024, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'bortoleto', 2025, 0, 0, 0, 19, 0, 2025, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'bottas', 2025, 10, 67, 20, 1797, 0, 2013, 2024, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'colapinto', 2025, 0, 0, 0, 5, 0, 2024, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'gasly', 2025, 1, 5, 0, 458, 0, 2017, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'hadjar', 2025, 0, 1, 0, 51, 0, 2025, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'hamilton', 2025, 105, 202, 104, 5018.5, 7, 2007, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'hulkenberg', 2025, 0, 1, 1, 622, 0, 2010, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'lawson', 2025, 0, 0, 0, 44, 0, 2023, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'leclerc', 2025, 8, 50, 27, 1672, 0, 2018, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'max_verstappen', 2025, 71, 127, 48, 3444.5, 4, 2015, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'norris', 2025, 11, 44, 16, 1430, 1, 2019, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'ocon', 2025, 1, 4, 0, 483, 0, 2016, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'perez', 2025, 6, 39, 3, 1638, 0, 2011, 2024, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'piastri', 2025, 9, 26, 6, 799, 0, 2023, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'russell', 2025, 5, 24, 7, 1033, 0, 2019, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'sainz', 2025, 4, 29, 6, 1336.5, 0, 2015, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'stroll', 2025, 0, 3, 1, 325, 0, 2017, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('driver', 'tsunoda', 2025, 0, 0, 0, 124, 0, 2021, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('constructor', 'alpine', 2025, 1, 6, 0, 535, 0, 2021, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('constructor', 'aston_martin', 2025, 0, 9, 0, 595, 0, 1959, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('constructor', 'audi', 2025, 0, 0, 0, 0, 0, NULL, NULL, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('constructor', 'cadillac', 2025, 0, 0, 0, 0, 0, NULL, NULL, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('constructor', 'ferrari', 2025, 248, 836, 0, 11031, 16, 1950, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('constructor', 'haas', 2025, 0, 0, 0, 386, 0, 2016, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('constructor', 'mclaren', 2025, 203, 558, 0, 8108.5, 10, 1966, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('constructor', 'mercedes', 2025, 131, 310, 0, 8159.5, 8, 1954, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('constructor', 'rb', 2025, 0, 1, 0, 92, 0, 2025, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('constructor', 'red_bull', 2025, 130, 297, 0, 8288, 6, 2005, 2025, 'f1db');
INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) VALUES ('constructor', 'williams', 2025, 114, 314, 0, 3774, 9, 1978, 2025, 'f1db');
