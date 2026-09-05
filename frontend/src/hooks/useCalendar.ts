import { useQuery } from "@tanstack/react-query";
import { fetchCalendar } from "../api/calendar";

export function useCalendar() {
  return useQuery({
    queryKey: ["calendar"],
    queryFn: fetchCalendar,
    // Календарь сезона меняется редко — можно держать "свежим" дольше,
    // чем дефолтные 60с из queryClient (совпадает с TTL кэша на бэкенде).
    staleTime: 5 * 60_000,
  });
}
