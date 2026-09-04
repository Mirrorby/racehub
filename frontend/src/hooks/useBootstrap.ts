import { useQuery } from "@tanstack/react-query";
import { fetchBootstrap } from "../api/auth";

export function useBootstrap() {
  return useQuery({
    queryKey: ["bootstrap"],
    queryFn: fetchBootstrap,
  });
}
