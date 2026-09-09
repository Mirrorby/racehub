import { useQuery } from "@tanstack/react-query";
import { fetchDriverCareer, fetchConstructorCareer, fetchTrackHistory } from "../api/career";

// Карьерная статистика на бэкенде кэшируется на 12ч (см. careerStatsService.ts) —
// staleTime здесь чуть короче, чтобы обычная навигация по экрану не била
// в сеть повторно, но без искусственного расхождения с бэкендом.
const CAREER_STALE_MS = 10 * 60 * 1000;

export function useDriverCareer(driverId: string | undefined) {
  return useQuery({
    queryKey: ["driver-career", driverId],
    queryFn: () => fetchDriverCareer(driverId as string),
    enabled: Boolean(driverId),
    staleTime: CAREER_STALE_MS,
  });
}

export function useConstructorCareer(constructorId: string | undefined) {
  return useQuery({
    queryKey: ["constructor-career", constructorId],
    queryFn: () => fetchConstructorCareer(constructorId as string),
    enabled: Boolean(constructorId),
    staleTime: CAREER_STALE_MS,
  });
}

export function useTrackHistory(circuitId: string | undefined) {
  return useQuery({
    queryKey: ["track-history", circuitId],
    queryFn: () => fetchTrackHistory(circuitId as string),
    enabled: Boolean(circuitId),
    staleTime: CAREER_STALE_MS,
  });
}
