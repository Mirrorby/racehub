#!/usr/bin/env python3
"""
Генерирует SQL для таблицы career_baseline из F1DB (https://github.com/f1db/f1db, CC BY 4.0).

Идея: исторические данные неизменны, поэтому «до сезона N» карьера считается ОДИН раз
из пакетного источника, а текущий сезон дописывается внутри D1 из season_races
(см. backend/src/cron/syncCareerFromResults.ts).

Использование:
  curl -sL -o f1db-sqlite.zip https://github.com/f1db/f1db/releases/latest/download/f1db-sqlite.zip
  unzip -o f1db-sqlite.zip
  python3 build_career_baseline.py f1db.db 2025 > 0007_career_baseline.sql

База = итоговые total_* из релиза F1DB МИНУС вклад сезона `through+1`, уже учтённый в этом релизе
(так базу нельзя «задвоить» с нашими результатами текущего сезона).
"""
import sqlite3, sys

DB = sys.argv[1] if len(sys.argv) > 1 else "f1db.db"
THROUGH = int(sys.argv[2]) if len(sys.argv) > 2 else 2025
CUR = THROUGH + 1

# F1DB abbreviation (на сетке сезона CUR) -> id, как в нашей D1 (Jolpica)
DRIVER_IDS = {
    "ALB": "albon", "ALO": "alonso", "ANT": "antonelli", "LIN": "arvid_lindblad", "BEA": "bearman",
    "BOR": "bortoleto", "BOT": "bottas", "COL": "colapinto", "GAS": "gasly", "HAD": "hadjar",
    "HAM": "hamilton", "HUL": "hulkenberg", "LAW": "lawson", "LEC": "leclerc", "VER": "max_verstappen",
    "NOR": "norris", "OCO": "ocon", "PER": "perez", "PIA": "piastri", "RUS": "russell",
    "SAI": "sainz", "STR": "stroll", "TSU": "tsunoda",
}
CONSTRUCTOR_IDS = {
    "alpine": "alpine", "aston-martin": "aston_martin", "audi": "audi", "cadillac": "cadillac",
    "ferrari": "ferrari", "haas": "haas", "mclaren": "mclaren", "mercedes": "mercedes",
    "racing-bulls": "rb", "red-bull": "red_bull", "williams": "williams",
}

c = sqlite3.connect(DB)
one = lambda sql, *a: c.execute(sql, a).fetchone()[0]

grid = {r[0]: r[1] for r in c.execute(
    "select d.abbreviation, d.id from driver d join season_driver sd on sd.driver_id = d.id where sd.year = ?", (CUR,))}


def num(x):
    x = float(x)
    return int(x) if x == int(x) else x


rows = []
for abbr, our_id in DRIVER_IDS.items():
    fid = grid[abbr]
    tot = c.execute(
        "select total_race_wins,total_podiums,total_pole_positions,total_championship_wins from driver where id=?", (fid,)).fetchone()
    cur = lambda extra: one(
        f"select count(*) from race_data d join race r on r.id=d.race_id where d.type='RACE_RESULT' and r.year=? and d.driver_id=? and {extra}", CUR, fid)
    w, p, po = tot[0] - cur("d.position_number=1"), tot[1] - cur("d.position_number between 1 and 3"), tot[2] - cur("d.race_pole_position=1")
    cur_pts = one("select coalesce(sum(d.race_points),0) from race_data d join race r on r.id=d.race_id "
                  "where d.type in ('RACE_RESULT','SPRINT_RACE_RESULT') and r.year=? and d.driver_id=?", CUR, fid)
    pts = num(one("select total_points from driver where id=?", fid)) - num(cur_pts)
    first = one("select min(r.year) from race_data d join race r on r.id=d.race_id where d.type='RACE_RESULT' and d.driver_id=? and r.year<=?", fid, THROUGH)
    last = one("select max(r.year) from race_data d join race r on r.id=d.race_id where d.type='RACE_RESULT' and d.driver_id=? and r.year<=?", fid, THROUGH)
    rows.append(("driver", our_id, w, p, po, num(pts), tot[3], first, last))

for fid, our_id in CONSTRUCTOR_IDS.items():
    tot = c.execute("select total_race_wins,total_podiums,total_points,total_championship_wins from constructor where id=?", (fid,)).fetchone()
    cur = lambda extra: one(
        f"select count(*) from race_data d join race r on r.id=d.race_id where d.type='RACE_RESULT' and r.year=? and d.constructor_id=? and {extra}", CUR, fid)
    w, p = tot[0] - cur("d.position_number=1"), tot[1] - cur("d.position_number between 1 and 3")
    cur_pts = one("select coalesce(points,0) from season_constructor_standing where year=? and constructor_id=?", CUR, fid) or 0
    pts = num(tot[2]) - num(cur_pts)
    first = one("select min(r.year) from race_data d join race r on r.id=d.race_id where d.type='RACE_RESULT' and d.constructor_id=? and r.year<=?", fid, THROUGH)
    last = one("select max(r.year) from race_data d join race r on r.id=d.race_id where d.type='RACE_RESULT' and d.constructor_id=? and r.year<=?", fid, THROUGH)
    rows.append(("constructor", our_id, w, p, 0, num(pts), tot[3], first, last))

version = one("select value from metadata where name='version'") if c.execute(
    "select count(*) from sqlite_master where name='metadata'").fetchone()[0] else "f1db"
sql = lambda v: "NULL" if v is None else str(v)

print(f"""-- career_baseline: исторические карьерные итоги ДО сезона {CUR} (включительно по {THROUGH}).
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
""")
for kind, eid, w, p, po, pts, t, first, last in rows:
    print(f"INSERT OR REPLACE INTO career_baseline (kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season, source) "
          f"VALUES ('{kind}', '{eid}', {THROUGH}, {w}, {p}, {po}, {pts}, {t}, {sql(first)}, {sql(last)}, 'f1db');")
