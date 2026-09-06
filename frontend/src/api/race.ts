import { apiFetch } from "./client";
import type { RaceDetailResponse } from "../types/domain";

export async function fetchRaceDetail(id: string): Promise<RaceDetailResponse> {
  return apiFetch<RaceDetailResponse>(`/race/${id}`);
}
