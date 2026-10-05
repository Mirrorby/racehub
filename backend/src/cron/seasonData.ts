import type { Env } from "../env";

/**
 * Агрегаты сезона, посчитанные ВНУТРИ D1 (SQLite json_each/SUM), а не в
 * воркере. На Workers Free у запуска 10 мс CPU: разбирать десятки КБ JSON
 * результатов всех этапов в JS — это уже несколько миллисекунд. SQL-запрос
 * выполняется на стороне D1 и возвращает в воркер по ~25 готовых строк.
 */

export interface Tally {
  id: string;
  code: string | null;
  fullName: string | null;
  /** Команда по самому свежему этапу (для пилотов) / каноническое id (для команд). */
  constructorId: string | null;
  constructorName: string | null;
  points: number;
  /** finishes[n] — сколько раз финишировал n-м в гонках (1..22) — для тай-брейка. */
  finishes: number[];
}

// Тай-брейк FIA идёт по всем местам, а не только по очковым: у пилотов без очков
// порядок в таблице решают 11-е, 12-е и т. д. места. В сезоне ≤ 22 машин.
const FINISH_POSITIONS = 22;

const FINISH_COLUMNS = Array.from({ length: FINISH_POSITIONS }, (_, i) => `SUM(kind = 'race' AND pt = '${i + 1}') AS f${i + 1}`).join(", ");

const CID = `CASE json_extract(e.value, '$.constructor.id')
               WHEN 'red_bull_racing' THEN 'red_bull' WHEN 'racing_bulls' THEN 'rb'
               ELSE json_extract(e.value, '$.constructor.id') END`;

// Строки результатов (гонка и спринт) всех не отменённых этапов сезонов > ?1.
// Фантомные id fast-пути OpenF1 ("openf1-N") отбрасываем.
const RES_CTE = `
WITH res AS (
  SELECT s.season AS season, s.round AS round, 'race' AS kind,
         json_extract(e.value, '$.driver.id') AS driver_id, json_extract(e.value, '$.driver.code') AS code,
         json_extract(e.value, '$.driver.fullName') AS full_name,
         ${CID} AS cid, json_extract(e.value, '$.constructor.name') AS cname,
         json_extract(e.value, '$.positionText') AS pt, COALESCE(json_extract(e.value, '$.points'), 0) AS pts
    FROM season_races s, json_each(s.race_results_json) e
   WHERE s.season > ?1 AND s.race_results_json IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM race_overrides ro WHERE ro.race_id = s.race_id AND ro.cancelled = 1)
  UNION ALL
  SELECT s.season, s.round, 'sprint',
         json_extract(e.value, '$.driver.id'), json_extract(e.value, '$.driver.code'), json_extract(e.value, '$.driver.fullName'),
         ${CID}, json_extract(e.value, '$.constructor.name'),
         json_extract(e.value, '$.positionText'), COALESCE(json_extract(e.value, '$.points'), 0)
    FROM season_races s, json_each(s.sprint_json) e
   WHERE s.season > ?1 AND s.sprint_json IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM race_overrides ro WHERE ro.race_id = s.race_id AND ro.cancelled = 1)
)`;

interface TallyRow {
  id: string;
  code: string | null;
  full_name: string | null;
  cid: string | null;
  cname: string | null;
  points: number;
  [finish: string]: unknown;
}

const toTally = (r: TallyRow): Tally => ({
  id: r.id,
  code: r.code,
  fullName: r.full_name,
  constructorId: r.cid,
  constructorName: r.cname,
  points: Number(r.points) || 0,
  finishes: [0, ...Array.from({ length: FINISH_POSITIONS }, (_, i) => Number(r[`f${i + 1}`]) || 0)],
});

/** Тоталы пилотов сезона; maxRoundExclusive — только этапы строго до указанного (для расчёта «движения»). */
export async function loadDriverTallies(env: Env, season: number, beforeRound?: number): Promise<Tally[]> {
  const { results } = await env.DB.prepare(
    `${RES_CTE}
     SELECT driver_id AS id, MAX(code) AS code, MAX(full_name) AS full_name, SUM(pts) AS points, ${FINISH_COLUMNS},
            (SELECT r2.cid FROM res r2 WHERE r2.season = res.season AND r2.driver_id = res.driver_id AND r2.kind = 'race'
              ${beforeRound ? "AND r2.round < ?3" : ""} ORDER BY r2.round DESC LIMIT 1) AS cid,
            (SELECT r2.cname FROM res r2 WHERE r2.season = res.season AND r2.driver_id = res.driver_id AND r2.kind = 'race'
              ${beforeRound ? "AND r2.round < ?3" : ""} ORDER BY r2.round DESC LIMIT 1) AS cname
       FROM res
      WHERE res.season = ?2 AND driver_id IS NOT NULL AND driver_id NOT LIKE 'openf1-%' ${beforeRound ? "AND res.round < ?3" : ""}
      GROUP BY driver_id`,
  )
    .bind(...(beforeRound ? [season - 1, season, beforeRound] : [season - 1, season]))
    .all<TallyRow>();
  return (results ?? []).map(toTally);
}

export async function loadConstructorTallies(env: Env, season: number, beforeRound?: number): Promise<Tally[]> {
  const { results } = await env.DB.prepare(
    `${RES_CTE}
     SELECT cid AS id, MAX(cname) AS cname, NULL AS code, NULL AS full_name, cid, SUM(pts) AS points, ${FINISH_COLUMNS}
       FROM res
      WHERE res.season = ?2 AND cid IS NOT NULL AND cid NOT LIKE 'openf1-%' ${beforeRound ? "AND res.round < ?3" : ""}
      GROUP BY cid`,
  )
    .bind(...(beforeRound ? [season - 1, season, beforeRound] : [season - 1, season]))
    .all<TallyRow>();
  return (results ?? []).map(toTally);
}

/** Самый свежий этап сезона, у которого уже есть результат гонки. */
export async function latestRoundWithResults(env: Env, season: number): Promise<number | null> {
  const row = await env.DB.prepare("SELECT MAX(round) AS r FROM season_races WHERE season = ? AND race_results_json IS NOT NULL")
    .bind(season)
    .first<{ r: number | null }>();
  return row?.r ?? null;
}

export interface CareerAgg {
  id: string;
  wins: number;
  podiums: number;
  points: number;
  firstSeason: number | null;
  lastSeason: number | null;
}

async function loadCareerAggs(env: Env, kind: "driver" | "constructor", afterSeason: number): Promise<Map<string, CareerAgg>> {
  const idExpr = kind === "driver" ? "driver_id" : "cid";
  const { results } = await env.DB.prepare(
    `${RES_CTE}
     SELECT ${idExpr} AS id,
            SUM(kind = 'race' AND pt = '1') AS wins,
            SUM(kind = 'race' AND pt IN ('1', '2', '3')) AS podiums,
            SUM(pts) AS points,
            MIN(CASE WHEN kind = 'race' THEN season END) AS first_season,
            MAX(CASE WHEN kind = 'race' THEN season END) AS last_season
       FROM res
      WHERE ${idExpr} IS NOT NULL AND ${idExpr} NOT LIKE 'openf1-%'
      GROUP BY ${idExpr}`,
  )
    .bind(afterSeason)
    .all<{ id: string; wins: number; podiums: number; points: number; first_season: number | null; last_season: number | null }>();
  return new Map(
    (results ?? []).map((r) => [
      r.id,
      { id: r.id, wins: Number(r.wins) || 0, podiums: Number(r.podiums) || 0, points: Number(r.points) || 0, firstSeason: r.first_season, lastSeason: r.last_season },
    ]),
  );
}

export const loadDriverCareerAggs = (env: Env, afterSeason: number) => loadCareerAggs(env, "driver", afterSeason);
export const loadConstructorCareerAggs = (env: Env, afterSeason: number) => loadCareerAggs(env, "constructor", afterSeason);

/** Поулы пилотов: 1-е место в квалификации этапов сезонов > afterSeason. */
export async function loadPoles(env: Env, afterSeason: number): Promise<Map<string, number>> {
  const { results } = await env.DB.prepare(
    `SELECT json_extract(e.value, '$.driver.id') AS id, COUNT(*) AS poles
       FROM season_races s, json_each(s.qualifying_json) e
      WHERE s.season > ? AND s.qualifying_json IS NOT NULL AND json_extract(e.value, '$.position') = 1
        AND NOT EXISTS (SELECT 1 FROM race_overrides ro WHERE ro.race_id = s.race_id AND ro.cancelled = 1)
      GROUP BY 1`,  // именно номер колонки: у json_each есть своя колонка id, GROUP BY id группировал бы по ней
  )
    .bind(afterSeason)
    .all<{ id: string | null; poles: number }>();
  return new Map((results ?? []).filter((r) => r.id && !r.id.startsWith("openf1-")).map((r) => [r.id as string, Number(r.poles) || 0]));
}

/** Сезоны, у которых у всех не отменённых этапов есть результат гонки (титул можно присуждать). */
export async function loadFinishedSeasons(env: Env, afterSeason: number): Promise<number[]> {
  const { results } = await env.DB.prepare(
    `SELECT s.season AS season, COUNT(*) AS total, SUM(s.race_results_json IS NOT NULL) AS done
       FROM season_races s
      WHERE s.season > ? AND NOT EXISTS (SELECT 1 FROM race_overrides ro WHERE ro.race_id = s.race_id AND ro.cancelled = 1)
      GROUP BY s.season`,
  )
    .bind(afterSeason)
    .all<{ season: number; total: number; done: number }>();
  return (results ?? []).filter((r) => r.total > 0 && Number(r.done) === Number(r.total)).map((r) => r.season);
}
