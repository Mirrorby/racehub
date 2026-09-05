import { apiFetch } from "./client";
import type { Standing } from "../types/domain";

export type StandingsType = "drivers" | "constructors";

export interface StandingsResponse {
  season: number;
  type: StandingsType;
  standings: Standing[];
}

export async function fetchStandings(type: StandingsType): Promise<StandingsResponse> {
  return apiFetch<StandingsResponse>(`/standings/${type}`);
}
