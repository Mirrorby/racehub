import { useQuery } from "@tanstack/react-query";
import { fetchRaceDetail } from "../api/race";

export function useRaceDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["race", id],
    queryFn: () => fetchRaceDetail(id as string),
    enabled: Boolean(id),
  });
}
