import type { Tally } from "../cron/seasonData";
import { canonicalConstructorId, canonicalConstructorName } from "../lib/constructorIds";
import type { Standing } from "../types";
import { constructorColor } from "./teamColors";

/**
 * Личный зачёт и Кубок конструкторов из результатов этапов в D1 (гонки +
 * спринты). Источник правды один — season_races, поэтому таблицы
 * обновляются в тот же тик, в который появился результат, и не зависят
 * ни от задержки Jolpica, ни от лимитов запросов, ни от того, что OpenF1
 * приписывает очки «текущей» команде пилота. Суммы считает сам D1
 * (см. cron/seasonData.ts); здесь только ранжирование и сборка записей.
 *
 * Проверено на реальных данных: суммы по D1 совпали с F1DB по всем пилотам
 * и командам. Тай-брейк — по правилам FIA: больше побед, потом вторых мест
 * и т. д. (в `finishes`).
 */

export interface StandingsMeta {
  drivers: Map<string, Standing>;
  constructors: Map<string, Standing>;
  colors: Map<string, string>;
  media: Map<string, string>;
}

export function rankTallies(tallies: Tally[]): Tally[] {
  return [...tallies].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    for (let i = 1; i < Math.max(a.finishes.length, b.finishes.length); i++) {
      const d = (b.finishes[i] ?? 0) - (a.finishes[i] ?? 0);
      if (d !== 0) return d;
    }
    return a.id.localeCompare(b.id);
  });
}

function positionsOf(tallies: Tally[]): Map<string, number> {
  return new Map(rankTallies(tallies).map((t, i) => [t.id, i + 1]));
}

function movement(prev: Map<string, number>, id: string, position: number): Standing["movement"] {
  const before = prev.get(id);
  if (before === undefined) return "unknown";
  if (before > position) return "up";
  if (before < position) return "down";
  return "same";
}

function constructorLook(meta: StandingsMeta, id: string, fallbackName?: string | null): { name: string; color: string; nationality?: string } {
  const cached = meta.constructors.get(id)?.constructor;
  return {
    name: cached?.name ?? canonicalConstructorName(id) ?? fallbackName ?? id,
    color: meta.colors.get(id) ?? cached?.color ?? constructorColor(id),
    nationality: cached?.nationality,
  };
}

/** previous — те же тоталы без последнего этапа (для стрелок «вверх/вниз»); пусто, если этап единственный. */
export function computeDriverStandings(current: Tally[], previous: Tally[], meta: StandingsMeta): Standing[] {
  const ranked = rankTallies(current);
  const prev = positionsOf(previous);
  const leader = ranked[0]?.points ?? 0;
  return ranked.map((t, i) => {
    const position = i + 1;
    const cached = meta.drivers.get(t.id)?.driver;
    const cid = t.constructorId ? canonicalConstructorId(t.constructorId) : (cached?.constructorId ?? "");
    const look = constructorLook(meta, cid, t.constructorName);
    return {
      position,
      points: t.points,
      wins: t.finishes[1] ?? 0,
      gapToLeader: t.points === leader ? 0 : leader - t.points,
      movement: movement(prev, t.id, position),
      driver: {
        id: t.id,
        code: cached?.code ?? t.code ?? t.id.slice(0, 3).toUpperCase(),
        number: cached?.number ?? null,
        fullName: cached?.fullName ?? t.fullName ?? t.id,
        constructorId: cid,
        constructorName: look.name,
        teamColor: look.color,
        headshotUrl: meta.media.get(t.id) ?? cached?.headshotUrl ?? null,
      },
      constructor: cid ? { id: cid, name: look.name, color: look.color, nationality: look.nationality } : undefined,
    };
  });
}

export function computeConstructorStandings(current: Tally[], previous: Tally[], meta: StandingsMeta): Standing[] {
  const ranked = rankTallies(current);
  const prev = positionsOf(previous);
  const leader = ranked[0]?.points ?? 0;
  return ranked.map((t, i) => {
    const position = i + 1;
    const look = constructorLook(meta, t.id, t.constructorName);
    return {
      position,
      points: t.points,
      wins: t.finishes[1] ?? 0,
      gapToLeader: t.points === leader ? 0 : leader - t.points,
      movement: movement(prev, t.id, position),
      constructor: { id: t.id, name: look.name, color: look.color, nationality: look.nationality },
    };
  });
}
