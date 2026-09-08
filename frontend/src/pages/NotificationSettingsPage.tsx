import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import { useBootstrap } from "../hooks/useBootstrap";
import { useUpdateNotificationSettings } from "../hooks/useUpdateNotificationSettings";
import type { NotificationSettings } from "../types/domain";

interface CategoryRowProps {
  label: string;
  enabled: boolean;
  minutesBefore: number;
  onEnabledChange: (value: boolean) => void;
  onMinutesChange: (value: number) => void;
}

function CategoryRow({ label, enabled, minutesBefore, onEnabledChange, onMinutesChange }: CategoryRowProps) {
  return (
    <div className="rh-row" style={{ alignItems: "center" }}>
      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} />
        {label}
      </label>
      {enabled && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--rh-text-secondary)" }}>
          <input
            type="number"
            min={0}
            max={1440}
            value={minutesBefore}
            onChange={(e) => onMinutesChange(Math.max(0, Math.min(1440, Number(e.target.value) || 0)))}
            style={{ width: 56 }}
          />
          min before
        </label>
      )}
    </div>
  );
}

export function NotificationSettingsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useBootstrap();
  const mutation = useUpdateNotificationSettings();

  const [draft, setDraft] = useState<NotificationSettings | null>(null);

  // Инициализируем черновик, когда данные подгрузятся; дальше правим
  // только локально, чтобы не слать запрос на каждый клик.
  useEffect(() => {
    if (data && !draft) setDraft(data.profile.notificationSettings);
  }, [data, draft]);

  function patch(changes: Partial<NotificationSettings>) {
    setDraft((prev) => (prev ? { ...prev, ...changes } : prev));
  }

  function save() {
    if (!draft) return;
    mutation.mutate(draft, { onSuccess: () => navigate("/more") });
  }

  return (
      <div className="rh-content"><div className="pp-wordmark">Podium Pulse</div><h1 className="pp-page-title">Notifications</h1>
        {isLoading && !draft && (
          <Spinner />
        )}

        {isError && <ErrorState onRetry={() => refetch()} />}

        {draft && (
          <>
            <div className="rh-card">
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600 }}>
                <input type="checkbox" checked={draft.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
                All notifications
              </label>
            </div>

            <div className="rh-section-title">Before each session</div>
            <div className="rh-card" style={{ opacity: draft.enabled ? 1 : 0.5, pointerEvents: draft.enabled ? "auto" : "none" }}>
              <CategoryRow
                label="Race"
                enabled={draft.raceEnabled}
                minutesBefore={draft.raceMinutesBefore}
                onEnabledChange={(v) => patch({ raceEnabled: v })}
                onMinutesChange={(v) => patch({ raceMinutesBefore: v })}
              />
              <CategoryRow
                label="Qualifying"
                enabled={draft.qualifyingEnabled}
                minutesBefore={draft.qualifyingMinutesBefore}
                onEnabledChange={(v) => patch({ qualifyingEnabled: v })}
                onMinutesChange={(v) => patch({ qualifyingMinutesBefore: v })}
              />
              <CategoryRow
                label="Sprint"
                enabled={draft.sprintEnabled}
                minutesBefore={draft.sprintMinutesBefore}
                onEnabledChange={(v) => patch({ sprintEnabled: v })}
                onMinutesChange={(v) => patch({ sprintMinutesBefore: v })}
              />
              <CategoryRow
                label="Practice"
                enabled={draft.practiceEnabled}
                minutesBefore={draft.practiceMinutesBefore}
                onEnabledChange={(v) => patch({ practiceEnabled: v })}
                onMinutesChange={(v) => patch({ practiceMinutesBefore: v })}
              />
            </div>

            <div className="rh-section-title">Results</div>
            <div className="rh-card" style={{ opacity: draft.enabled ? 1 : 0.5, pointerEvents: draft.enabled ? "auto" : "none" }}>
              <label className="rh-row" style={{ cursor: "pointer" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="checkbox" checked={draft.resultsEnabled} onChange={(e) => patch({ resultsEnabled: e.target.checked })} />
                  Race results
                </span>
              </label>
              <label className="rh-row" style={{ cursor: "pointer" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={draft.favoriteDriverResultEnabled}
                    onChange={(e) => patch({ favoriteDriverResultEnabled: e.target.checked })}
                  />
                  Favourite driver's result
                </span>
              </label>
              <label className="rh-row" style={{ cursor: "pointer" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={draft.championshipChangeEnabled}
                    onChange={(e) => patch({ championshipChangeEnabled: e.target.checked })}
                  />
                  Championship lead changes
                </span>
              </label>
            </div>
            <p className="rh-disclaimer">
              Results-based notifications aren't sent yet — this data feed is still on the roadmap. Session
              reminders above are already active.
            </p>

            {mutation.isError && (
              <p style={{ color: "var(--rh-danger, #e5484d)", fontSize: 13, marginBottom: 8 }}>
                Couldn't save — check your connection and try again.
              </p>
            )}

            <button className="rh-btn-primary" onClick={save} disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save"}
            </button>
          </>
        )}
      </div>
  );
}
