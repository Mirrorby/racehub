import type { RawQualifyingResult, RawResult } from "../providers/jolpica";
import type { QualifyingResultEntry, RaceResultEntry } from "../types";

export function mapRaceResults(raw: RawResult[]): RaceResultEntry[] {
  return raw.map((entry) => ({
    position: Number(entry.position),
    positionText: entry.positionText,
    driver: {
      id: entry.Driver.driverId,
      code: entry.Driver.code ?? entry.Driver.driverId.slice(0, 3).toUpperCase(),
      fullName: `${entry.Driver.givenName} ${entry.Driver.familyName}`,
    },
    constructor: { id: entry.Constructor.constructorId, name: entry.Constructor.name },
    grid: Number(entry.grid),
    laps: Number(entry.laps),
    status: entry.status,
    points: Number(entry.points),
  }));
}

// Sprint-гонка у Ergast/Jolpica — та же форма RawResult, что и обычная
// гонка, поэтому отдельного маппера не нужно: mapRaceResults уже делает
// ровно то же самое сведение полей.
export const mapSprintResults = mapRaceResults;

export function mapQualifyingResults(raw: RawQualifyingResult[]): QualifyingResultEntry[] {
  return raw.map((entry) => ({
    position: Number(entry.position),
    driver: {
      id: entry.Driver.driverId,
      code: entry.Driver.code ?? entry.Driver.driverId.slice(0, 3).toUpperCase(),
      fullName: `${entry.Driver.givenName} ${entry.Driver.familyName}`,
    },
    constructor: { id: entry.Constructor.constructorId, name: entry.Constructor.name },
    q1: entry.Q1 ?? null,
    q2: entry.Q2 ?? null,
    q3: entry.Q3 ?? null,
  }));
}
