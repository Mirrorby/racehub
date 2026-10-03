-- Правка данных сезона 2026 (подготовлено 03.10.2026, сверка с F1DB v2026.15.1).
--
-- 1) Этап 6 (Монако): в D1 осталась классификация ДО пересмотра стюардов.
--    По F1DB: HAD 3-й (15), PIA 4-й (12), LAW 5-й (10), LIN 6-й (8), GAS 7-й (6).
-- 2) Нормализация id команд в результатах: red_bull_racing -> red_bull,
--    racing_bulls -> rb (как в standings_cache / team_colors / constructor_career).
--
-- Перед правкой старые значения копируются в таблицу-бэкап (откат: UPDATE ... SET x = backup.x).

CREATE TABLE IF NOT EXISTS results_fix_backup_20261003 (
  race_id TEXT PRIMARY KEY,
  race_results_json TEXT,
  sprint_json TEXT,
  qualifying_json TEXT
);
INSERT OR IGNORE INTO results_fix_backup_20261003 (race_id, race_results_json, sprint_json, qualifying_json)
SELECT race_id, race_results_json, sprint_json, qualifying_json FROM season_races WHERE season = 2026;

-- 1) Монако
UPDATE season_races
SET race_results_json = (
      SELECT json_group_array(json(v)) FROM (
        SELECT v FROM (
          SELECT e.key AS k,
                 CASE json_extract(e.value, '$.driver.id')
                   WHEN 'hadjar'         THEN json_set(e.value, '$.position', 3, '$.positionText', '3', '$.points', 15)
                   WHEN 'piastri'        THEN json_set(e.value, '$.position', 4, '$.positionText', '4', '$.points', 12)
                   WHEN 'lawson'         THEN json_set(e.value, '$.position', 5, '$.positionText', '5', '$.points', 10)
                   WHEN 'arvid_lindblad' THEN json_set(e.value, '$.position', 6, '$.positionText', '6', '$.points', 8)
                   WHEN 'gasly'          THEN json_set(e.value, '$.position', 7, '$.positionText', '7', '$.points', 6)
                   ELSE e.value
                 END AS v
          FROM json_each(season_races.race_results_json) e
        )
        ORDER BY json_extract(v, '$.position'), k
      )
    ),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE race_id = '2026-6';

-- 2) id команд
UPDATE season_races
SET race_results_json = replace(replace(race_results_json, '"id":"red_bull_racing"', '"id":"red_bull"'), '"id":"racing_bulls"', '"id":"rb"')
WHERE race_results_json LIKE '%"id":"red_bull_racing"%' OR race_results_json LIKE '%"id":"racing_bulls"%';

UPDATE season_races
SET sprint_json = replace(replace(sprint_json, '"id":"red_bull_racing"', '"id":"red_bull"'), '"id":"racing_bulls"', '"id":"rb"')
WHERE sprint_json LIKE '%"id":"red_bull_racing"%' OR sprint_json LIKE '%"id":"racing_bulls"%';

UPDATE season_races
SET qualifying_json = replace(replace(qualifying_json, '"id":"red_bull_racing"', '"id":"red_bull"'), '"id":"racing_bulls"', '"id":"rb"')
WHERE qualifying_json LIKE '%"id":"red_bull_racing"%' OR qualifying_json LIKE '%"id":"racing_bulls"%';
