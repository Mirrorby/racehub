import { useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Skeleton } from "../components/Skeleton";
import { SessionRow } from "../components/SessionRow";
import { StatusBadge } from "../components/StatusBadge";
import { useCalendar } from "../hooks/useCalendar";
import type { RaceWeekend } from "../types/domain";

/** ISO 3166-1 alpha-2 -> emoji flag. Тот же приём, что и в RaceCard. */
function flagEmoji(countryCode: string): string {
  if (countryCode.length !== 2) return "";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function raceDate(weekend: RaceWeekend): string {
  const race = weekend.sessions.find((s) => s.type === "race");
  if (!race) return "";
  return new Date(race.startUtc).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function RaceListItem({ weekend }: { weekend: RaceWeekend }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rh-card" style={{ padding: 0 }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "inherit",
          padding: "14px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {weekend.countryCode ? `${flagEmoji(weekend.countryCode)} ` : ""}
            {weekend.name}
          </div>
          <div style={{ color: "var(--rh-text-secondary)", fontSize: 13, marginTop: 2 }}>
            Round {weekend.round} • {raceDate(weekend)}
          </div>
        </div>
        <StatusBadge status={weekend.status === "current" ? "live" : weekend.status === "completed" ? "completed" : "upcoming"} />
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--rh-border)" }}>
          {weekend.sessions.map((session) => (
            <SessionRow key={session.type} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Calendar() {
  const { data, isLoading, isError, refetch } = useCalendar();

  return (
    <>
      <AppHeader title={data ? `Calendar — ${data.season}` : "Calendar"} />
      <div className="rh-content">
        {isLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Skeleton height={64} />
            <Skeleton height={64} />
            <Skeleton height={64} />
          </div>
        )}

        {isError && <ErrorState onRetry={() => refetch()} />}

        {data && data.races.length === 0 && <EmptyState icon="📅" message="No races found for this season." />}

        {data && data.races.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.races.map((weekend) => (
              <RaceListItem key={weekend.id} weekend={weekend} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
