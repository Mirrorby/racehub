import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updatePreferences, type UpdatePreferencesPayload } from "../api/preferences";
import type { BootstrapResponse } from "../types/domain";

export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdatePreferencesPayload) => updatePreferences(payload),
    onSuccess: ({ preferences }) => {
      // Точечно обновляем кэш bootstrap вместо инвалидации — иначе Home
      // на секунду мигнёт скелетоном загрузки после каждого сохранения.
      queryClient.setQueryData<BootstrapResponse>(["bootstrap"], (prev) =>
        prev ? { ...prev, profile: { ...prev.profile, preferences } } : prev,
      );
    },
  });
}
