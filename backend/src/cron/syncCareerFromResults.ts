import type { Env } from "../env";
import { canonicalConstructorId } from "../lib/constructorIds";
import { loadConstructorCareerAggs, loadDriverCareerAggs, loadFinishedSeasons, loadPoles } from "./seasonData";

/**
 * Карьера пилотов/команд = неизменная история (таблица career_baseline,
 * разовая загрузка из F1DB, см. scripts/build_career_baseline.py) + то,
 * что уже лежит в season_races за сезоны ПОСЛЕ baseline.
 *
 * Чистый D1: ни одного запроса к Jolpica/OpenF1. Вызывается из
 * syncDerivedFromResults в тот же тик, в который изменились результаты.
 *
 * Работает только с сущностями, у которых есть строка в career_baseline
 * И уже есть строка в driver_career/constructor_career (nationality,
 * dateOfBirth и пр. остаются как есть — их создаёт round-robin).
 */

export { canonicalConstructorId };

export interface BaselineRow {
  kind: "driver" | "constructor";
  entity_id: string;
  through_season: number;
  wins: number;
  podiums: number;
  poles: number;
  points: number;
  championships: number;
  first_season: number | null;
  last_season: number | null;
}

interface CareerJson {
  wins?: number;
  podiums?: number;
  poles?: number;
  points?: number;
  championships?: number | null;
  firstSeason?: number | null;
  lastSeason?: number | null;
  [key: string]: unknown;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export async function loadBaseline(env: Env): Promise<BaselineRow[]> {
  try {
    const res = await env.DB.prepare(
      "SELECT kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season FROM career_baseline",
    ).all<BaselineRow>();
    return res.results ?? [];
  } catch {
    // Миграция 0007 не накатана — карьеру продолжает вести round-robin.
    return [];
  }
}

export type SeasonLeaders = Map<number, { drivers?: string; constructors?: string }>;

async function leaderFromCache(env: Env, type: "drivers" | "constructors", season: number): Promise<string | undefined> {
  const row = await env.DB.prepare("SELECT data_json FROM standings_cache WHERE type = ? AND season = ?")
    .bind(type, season)
    .first<{ data_json: string }>();
  if (!row) return undefined;
  const standings = JSON.parse(row.data_json) as Array<{ position: number; driver?: { id?: string }; constructor?: { id?: string } }>;
  const leader = standings.find((s) => Number(s.position) === 1);
  const id = type === "drivers" ? leader?.driver?.id : leader?.constructor?.id;
  return id && type === "constructors" ? canonicalConstructorId(id) : id;
}

/**
 * Пересчитывает карьеру и пишет только изменившиеся строки. Суммы за
 * сезоны после baseline считает сам D1 (cron/seasonData.ts). `leaders` —
 * лидеры чемпионата по сезонам, уже посчитанные вызывающим кодом
 * (иначе берём из standings_cache). Титул даётся только за ЗАВЕРШЁННЫЙ
 * сезон: у всех не отменённых этапов есть результат гонки.
 */
export async function applyCareer(env: Env, baseline: BaselineRow[], afterSeason: number, leaders: SeasonLeaders): Promise<number> {
  if (baseline.length === 0) return 0;

  const [drivers, constructors, poles, finished] = await Promise.all([
    loadDriverCareerAggs(env, afterSeason),
    loadConstructorCareerAggs(env, afterSeason),
    loadPoles(env, afterSeason),
    loadFinishedSeasons(env, afterSeason),
  ]);

  const titles = { drivers: new Map<string, number>(), constructors: new Map<string, number>() };
  for (const season of finished) {
    for (const type of ["drivers", "constructors"] as const) {
      const champion = leaders.get(season)?.[type] ?? (await leaderFromCache(env, type, season));
      if (champion) titles[type].set(champion, (titles[type].get(champion) ?? 0) + 1);
    }
  }

  const [existingDrivers, existingConstructors] = await Promise.all([
    env.DB.prepare("SELECT driver_id AS id, data_json FROM driver_career").all<{ id: string; data_json: string }>(),
    env.DB.prepare("SELECT constructor_id AS id, data_json FROM constructor_career").all<{ id: string; data_json: string }>(),
  ]);
  const existing = {
    driver: new Map((existingDrivers.results ?? []).map((r) => [r.id, r.data_json])),
    constructor: new Map((existingConstructors.results ?? []).map((r) => [r.id, r.data_json])),
  };

  const nowIso = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  for (const b of baseline) {
    const currentJson = existing[b.kind].get(b.entity_id);
    if (!currentJson) continue; // строку заводит round-robin (nationality/dateOfBirth оттуда)

    const a = (b.kind === "driver" ? drivers : constructors).get(b.entity_id);
    const titleMap = b.kind === "driver" ? titles.drivers : titles.constructors;

    const current = JSON.parse(currentJson) as CareerJson;
    const next: CareerJson = {
      ...current,
      wins: b.wins + (a?.wins ?? 0),
      podiums: b.podiums + (a?.podiums ?? 0),
      points: round2(b.points + (a?.points ?? 0)),
      championships: b.championships + (titleMap.get(b.entity_id) ?? 0),
      firstSeason: b.first_season ?? a?.firstSeason ?? current.firstSeason ?? null,
      lastSeason: Math.max(b.last_season ?? 0, a?.lastSeason ?? 0) || (current.lastSeason ?? null),
    };
    if (b.kind === "driver") next.poles = b.poles + (poles.get(b.entity_id) ?? 0);

    if (!(Object.keys(next) as Array<keyof CareerJson>).some((k) => next[k] !== current[k])) continue;

    const table = b.kind === "driver" ? "driver_career" : "constructor_career";
    const idColumn = b.kind === "driver" ? "driver_id" : "constructor_id";
    statements.push(
      env.DB.prepare(`UPDATE ${table} SET data_json = ?, updated_at = ? WHERE ${idColumn} = ?`).bind(JSON.stringify(next), nowIso, b.entity_id),
    );
  }

  if (statements.length > 0) await env.DB.batch(statements);
  return statements.length;
}

/** id сущностей, карьеру которых ведёт этот модуль (round-robin их не трогает). */
export async function loadBaselineIds(env: Env): Promise<Set<string>> {
  const rows = await loadBaseline(env);
  return new Set(rows.map((r) => `${r.kind}:${r.entity_id}`));
}
