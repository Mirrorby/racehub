import { useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Skeleton } from "../components/Skeleton";
import { StandingRow } from "../components/StandingRow";
import { useStandings } from "../hooks/useStandings";
import type { StandingsType } from "../api/standings";

export function Standings() {
  const [tab, setTab] = useState<StandingsType>("drivers");
  const { data, isLoading, isError, refetch } = useStandings(tab);

  return (
    <>
      <AppHeader title={data ? `Standings — ${data.season}` : "Standings"} />
      <div className="rh-content">
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <TabButton active={tab === "drivers"} onClick={() => setTab("drivers")} label="Drivers" />
          <TabButton active={tab === "constructors"} onClick={() => setTab("constructors")} label="Constructors" />
        </div>

        {isLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton height={40} />
            <Skeleton height={40} />
            <Skeleton height={40} />
          </div>
        )}

        {isError && <ErrorState onRetry={() => refetch()} />}

        {data && data.standings.length === 0 && (
          <EmptyState message={`${tab === "drivers" ? "Driver" : "Constructor"} standings aren't available yet.`} />
        )}

        {data && data.standings.length > 0 && (
          <div className="rh-card" style={{ padding: 0 }}>
            {data.standings.map((standing) => (
              <StandingRow key={standing.driver?.id ?? standing.constructor?.id ?? standing.position} standing={standing} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "8px 0",
        borderRadius: "var(--rh-radius-sm)",
        border: "1px solid var(--rh-border)",
        background: active ? "var(--rh-accent)" : "transparent",
        color: active ? "var(--rh-accent-contrast)" : "var(--rh-text-primary)",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
