import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateNotificationSettings, type UpdateNotificationSettingsPayload } from "../api/notifications";
import type { BootstrapResponse } from "../types/domain";

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateNotificationSettingsPayload) => updateNotificationSettings(payload),
    onSuccess: ({ notificationSettings }) => {
      queryClient.setQueryData<BootstrapResponse>(["bootstrap"], (prev) =>
        prev ? { ...prev, profile: { ...prev.profile, notificationSettings } } : prev,
      );
    },
  });
}
