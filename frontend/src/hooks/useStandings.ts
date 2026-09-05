import { useQuery } from "@tanstack/react-query";
import { fetchStandings, type StandingsType } from "../api/standings";

export function useStandings(type: StandingsType) {
  return useQuery({
    queryKey: ["standings", type],
    queryFn: () => fetchStandings(type),
  });
}
