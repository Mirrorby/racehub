import type { Env } from "../env";
import { errorReason } from "../lib/errors";

/**
 * Карьера пилотов/команд = неизменная история (таблица career_baseline,
 * разовая загрузка из F1DB, см. scripts/build_career_baseline.py) + то,
 * что уже лежит в season_races за сезоны ПОСЛЕ baseline.
 *
 * Чистый D1: ни одного подзапроса к Jolpica/OpenF1. Поэтому карьера
 * обновляется в тот же тик, в который в season_races появился результат
 * гонки/спринта/квалификации, а не раз в ~9 часов по round-robin и не
 * постраничным перебором, который на командах с тысячами результатов
 * обрезался на 500 строках (Ferrari: 41 победа вместо 250).
 *
 * Работает только с сущностями, у которых есть строка в career_baseline
 * И уже есть строка в driver_career/constructor_career (nationality,
 * dateOfBirth и пр. остаются как есть — их создаёт round-robin).
 */

// Канонические id команд — те же, что в standings_cache/team_colors/
// constructor_career. Старые строки результатов и fast-путь OpenF1
// местами писали "red_bull_racing"/"racing_bulls".
const CONSTRUCTOR_ALIASES: Record<string, string> = {
  red_bull_racing: "red_bull",
  racing_bulls: "rb",
};

export function canonicalConstructorId(id: string): string {
  return CONSTRUCTOR_ALIASES[id] ?? id;
}

interface BaselineRow {
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

interface RaceRow {
  season: number;
  status: string | null;
  cancelled: number;
  race_results_json: string | null;
  sprint_json: string | null;
  qualifying_json: string | null;
}

interface ResultEntry {
  positionText?: string;
  points?: number;
  position?: number;
  driver?: { id?: string };
  constructor?: { id?: string };
}

interface Acc {
  wins: number;
  podiums: number;
  poles: number;
  points: number;
  seasons: Set<number>;
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

function parseArray(json: string | null): ResultEntry[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as ResultEntry[]) : [];
  } catch {
    return [];
  }
}

function acc(map: Map<string, Acc>, id: string): Acc {
  let a = map.get(id);
  if (!a) {
    a = { wins: 0, podiums: 0, poles: 0, points: 0, seasons: new Set() };
    map.set(id, a);
  }
  return a;
}

// Фантомные id fast-пути OpenF1 ("openf1-12") не принадлежат ни одной
// реальной сущности — пропускаем, а не заводим по ним строку.
function usable(id: string | undefined): id is string {
  return !!id && !id.startsWith("openf1-");
}

/** Чистая функция — вся арифметика здесь, чтобы её можно было проверить без БД. */
export function aggregateSeasons(rows: RaceRow[]): { drivers: Map<string, Acc>; constructors: Map<string, Acc> } {
  const drivers = new Map<string, Acc>();
  const constructors = new Map<string, Acc>();

  for (const row of rows) {
    if (row.cancelled) continue;

    for (const [json, isSprint] of [
      [row.race_results_json, false],
      [row.sprint_json, true],
    ] as const) {
      for (const entry of parseArray(json)) {
        const points = Number(entry.points ?? 0) || 0;
        // positionText, а не position: у сошедших position — технический
        // номер (9999 или порядковый), а "1"/"2"/"3" только у классифицированных.
        const text = entry.positionText;
        const isWin = !isSprint && text === "1";
        const isPodium = !isSprint && (text === "1" || text === "2" || text === "3");

        const driverId = entry.driver?.id;
        if (usable(driverId)) {
          const a = acc(drivers, driverId);
          a.points += points;
          if (!isSprint) a.seasons.add(row.season);
          if (isWin) a.wins += 1;
          if (isPodium) a.podiums += 1;
        }
        const rawConstructorId = entry.constructor?.id;
        if (usable(rawConstructorId)) {
          const a = acc(constructors, canonicalConstructorId(rawConstructorId));
          a.points += points;
          if (!isSprint) a.seasons.add(row.season);
          if (isWin) a.wins += 1;
          if (isPodium) a.podiums += 1;
        }
      }
    }

    // Поул — 1-е место в квалификации (спринт-квалификацию не считаем, как и F1DB).
    for (const entry of parseArray(row.qualifying_json)) {
      if (Number(entry.position) === 1 && usable(entry.driver?.id)) {
        acc(drivers, entry.driver!.id!).poles += 1;
      }
    }
  }
  return { drivers, constructors };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

async function championOfFinishedSeason(
  env: Env,
  type: "drivers" | "constructors",
  season: number,
): Promise<string | null> {
  const row = await env.DB.prepare("SELECT data_json FROM standings_cache WHERE type = ? AND season = ?")
    .bind(type, season)
    .first<{ data_json: string }>();
  if (!row) return null;
  const standings = JSON.parse(row.data_json) as Array<{
    position: number;
    driver?: { id?: string };
    constructor?: { id?: string };
  }>;
  const leader = standings.find((s) => Number(s.position) === 1);
  const id = type === "drivers" ? leader?.driver?.id : leader?.constructor?.id;
  if (!id) return null;
  return type === "constructors" ? canonicalConstructorId(id) : id;
}

export async function syncCareerFromResults(env: Env): Promise<void> {
  let baseline: BaselineRow[];
  try {
    const res = await env.DB.prepare(
      "SELECT kind, entity_id, through_season, wins, podiums, poles, points, championships, first_season, last_season FROM career_baseline",
    ).all<BaselineRow>();
    baseline = res.results ?? [];
  } catch (err) {
    // Миграция 0007 ещё не накатана — прежнее поведение (round-robin) продолжает работать.
    console.log(`syncCareerFromResults: career_baseline unavailable (${errorReason(err)}), skipping`);
    return;
  }
  if (baseline.length === 0) return;

  const throughMin = Math.min(...baseline.map((b) => b.through_season));
  const { results: raceRows } = await env.DB.prepare(
    `SELECT s.season AS season,
            json_extract(s.weekend_json, '$.status') AS status,
            EXISTS (SELECT 1 FROM race_overrides ro WHERE ro.race_id = s.race_id AND ro.cancelled = 1) AS cancelled,
            s.race_results_json, s.sprint_json, s.qualifying_json
       FROM season_races s
      WHERE s.season > ?
      ORDER BY s.season, s.round`,
  )
    .bind(throughMin)
    .all<RaceRow>();
  const rows = raceRows ?? [];

  const { drivers, constructors } = aggregateSeasons(rows);

  // Титул даём только за ЗАВЕРШЁННЫЙ сезон: все не отменённые этапы
  // completed и с результатом гонки. Прежний подсчёт засчитывал титул
  // действующему лидеру незаконченного чемпионата (Antonelli = 1 титул).
  const seasons = [...new Set(rows.map((r) => r.season))];
  const titles = { drivers: new Map<string, number>(), constructors: new Map<string, number>() };
  for (const season of seasons) {
    const live = rows.filter((r) => r.season === season && !r.cancelled);
    const finished = live.length > 0 && live.every((r) => r.status === "completed" && r.race_results_json);
    if (!finished) continue;
    for (const type of ["drivers", "constructors"] as const) {
      const champion = await championOfFinishedSeason(env, type, season);
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
    const seasonsSeen = a ? [...a.seasons] : [];

    const current = JSON.parse(currentJson) as CareerJson;
    const next: CareerJson = {
      ...current,
      wins: b.wins + (a?.wins ?? 0),
      podiums: b.podiums + (a?.podiums ?? 0),
      points: round2(b.points + (a?.points ?? 0)),
      championships: b.championships + (titleMap.get(b.entity_id) ?? 0),
      firstSeason: b.first_season ?? (seasonsSeen.length ? Math.min(...seasonsSeen) : (current.firstSeason ?? null)),
      lastSeason: Math.max(b.last_season ?? 0, ...seasonsSeen) || (current.lastSeason ?? null),
    };
    if (b.kind === "driver") next.poles = b.poles + (a?.poles ?? 0);

    const changed = (Object.keys(next) as Array<keyof CareerJson>).some((k) => next[k] !== current[k]);
    if (!changed) continue;

    const table = b.kind === "driver" ? "driver_career" : "constructor_career";
    const idColumn = b.kind === "driver" ? "driver_id" : "constructor_id";
    statements.push(
      env.DB.prepare(`UPDATE ${table} SET data_json = ?, updated_at = ? WHERE ${idColumn} = ?`).bind(
        JSON.stringify(next),
        nowIso,
        b.entity_id,
      ),
    );
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
    console.log(`syncCareerFromResults: updated ${statements.length} career rows`);
  }
}

/** id сущностей, карьеру которых ведёт этот модуль (round-robin их не трогает). */
export async function loadBaselineIds(env: Env): Promise<Set<string>> {
  try {
    const res = await env.DB.prepare("SELECT kind, entity_id FROM career_baseline").all<{ kind: string; entity_id: string }>();
    return new Set((res.results ?? []).map((r) => `${r.kind}:${r.entity_id}`));
  } catch {
    return new Set();
  }
}
