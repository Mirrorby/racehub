import type { Env } from "../env";
import { getOrRefresh } from "../lib/cache";
import * as jolpica from "../providers/jolpica";
import type { TrackHistory } from "../types";

const TRACK_HISTORY_TTL_SECONDS = 24 * 60 * 60;

function parseLapTimeToSeconds(time: string): number {
  // Ergast формат — "M:SS.mmm" (иногда просто "SS.mmm" для очень старых записей).
  const parts = time.split(":");
  if (parts.length === 2) {
    return Number(parts[0]) * 60 + Number(parts[1]);
  }
  return Number(parts[0]);
}

export async function getTrackHistory(env: Env, circuitId: string): Promise<TrackHistory | null> {
  return getOrRefresh(env, `track-history:${circuitId}`, TRACK_HISTORY_TTL_SECONDS, async () => {
    const [races, fastestLapRaces, allResults] = await Promise.all([
      jolpica.getCircuitRaces(circuitId),
      jolpica.getCircuitFastestLaps(circuitId),
      jolpica.getCircuitAllResultsIfFits(circuitId),
    ]);

    if (races.length === 0) return null;

    const seasons = races.map((r) => Number(r.season));
    const firstSeason = Math.min(...seasons);
    const lastSeason = Math.max(...seasons);

    // "Самый успешный пилот/команда" считается только если вся история
    // трассы уместилась в одну страницу (см. комментарий у
    // getCircuitAllResultsIfFits) — для трасс с короткой историей (Майами,
    // Вегас, Джидда, Мадрид) посчитается, для легендарных долгожителей
    // (Монца, Сильверстоун, Монако) — честно null, а не рискованная частичная агрегация.
    let mostWinsDriver: TrackHistory["mostWinsDriver"] = null;
    let mostWinsConstructor: TrackHistory["mostWinsConstructor"] = null;
    if (allResults) {
      const driverWinCounts = new Map<string, { count: number; fullName: string }>();
      const constructorWinCounts = new Map<string, { count: number; name: string }>();
      for (const race of allResults) {
        const winner = race.Results.find((r) => Number(r.position) === 1);
        if (!winner) continue;
        const dEntry = driverWinCounts.get(winner.Driver.driverId);
        driverWinCounts.set(winner.Driver.driverId, {
          count: (dEntry?.count ?? 0) + 1,
          fullName: `${winner.Driver.givenName} ${winner.Driver.familyName}`,
        });
        const cEntry = constructorWinCounts.get(winner.Constructor.constructorId);
        constructorWinCounts.set(winner.Constructor.constructorId, {
          count: (cEntry?.count ?? 0) + 1,
          name: winner.Constructor.name,
        });
      }
      const topDriver = [...driverWinCounts.values()].sort((a, b) => b.count - a.count)[0];
      const topConstructor = [...constructorWinCounts.values()].sort((a, b) => b.count - a.count)[0];
      mostWinsDriver = topDriver ? { name: topDriver.fullName, wins: topDriver.count } : null;
      mostWinsConstructor = topConstructor ? { name: topConstructor.name, wins: topConstructor.count } : null;
    }

    // FastestLap появился у Ergast только с сезона 2004 — для трасс, не
    // принимавших гонки с тех пор, здесь будет пусто.
    let lapRecord: TrackHistory["lapRecord"] = null;
    let bestSeconds = Infinity;
    for (const race of fastestLapRaces) {
      const result = race.Results[0];
      const timeStr = result?.FastestLap?.Time.time;
      if (!timeStr) continue;
      const seconds = parseLapTimeToSeconds(timeStr);
      if (seconds < bestSeconds) {
        bestSeconds = seconds;
        lapRecord = {
          time: timeStr,
          driver: `${result.Driver.givenName} ${result.Driver.familyName}`,
          constructor: result.Constructor.name,
          season: Number(race.season),
        };
      }
    }

    return {
      firstSeason,
      lastSeason,
      totalRaces: races.length,
      winsStatsAvailable: allResults !== null,
      mostWinsDriver,
      mostWinsConstructor,
      lapRecord,
    };
  });
}
