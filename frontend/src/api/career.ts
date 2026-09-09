import { apiFetch } from "./client";
import type { DriverCareerStats, ConstructorCareerStats, TrackHistory } from "../types/domain";

export async function fetchDriverCareer(driverId: string): Promise<DriverCareerStats> {
  return apiFetch<DriverCareerStats>(`/drivers/${driverId}/career`);
}

export async function fetchConstructorCareer(constructorId: string): Promise<ConstructorCareerStats> {
  return apiFetch<ConstructorCareerStats>(`/constructors/${constructorId}/career`);
}

export async function fetchTrackHistory(circuitId: string): Promise<TrackHistory> {
  return apiFetch<TrackHistory>(`/circuits/${circuitId}/history`);
}
