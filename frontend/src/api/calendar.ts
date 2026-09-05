import { apiFetch } from "./client";
import type { RaceWeekend } from "../types/domain";

export interface CalendarResponse {
  season: number;
  races: RaceWeekend[];
}

export async function fetchCalendar(): Promise<CalendarResponse> {
  return apiFetch<CalendarResponse>("/calendar");
}
