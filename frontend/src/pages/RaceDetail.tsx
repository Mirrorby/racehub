import { useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Skeleton } from "../components/Skeleton";
import { SessionRow } from "../components/SessionRow";
import { StatusBadge } from "../components/StatusBadge";
import { QualifyingResultRow, RaceResultRow } from "../components/RaceResultRow";
import { useRaceDetail } from "../hooks/useRaceDetail";

export function RaceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useRaceDetail(id);

  return (
    <>
      <AppHeader
        title={data?.weekend.name ?? "Race"}
        action={
          <button onClick={() => navigate("/calendar")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>
            ‹ Back
          </button>
        }
      />
      <div className="rh-content">
        {isLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Skeleton height={80} />
            <Skeleton height={140} />
          </div>
        )}

        {isError && <ErrorState onRetry={() => refetch()} />}

        {data && (
          <>
            <div className="rh-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700 }}>
                  Round {data.weekend.round} · {data.weekend.circuit}
                </div>
                <div style={{ color: "var(--rh-text-secondary)", fontSize: 13 }}>
                  {data.weekend.city}, {data.weekend.country}
                </div>
              </div>
              <StatusBadge status={data.weekend.status === "current" ? "live" : data.weekend.status === "completed" ? "completed" : "upcoming"} />
            </div>

            <div className="rh-section-title">Schedule</div>
            <div className="rh-card">
              {data.weekend.sessions.map((session) => (
                <SessionRow key={session.type} session={session} />
              ))}
            </div>

            <div className="rh-section-title">Qualifying results</div>
            {data.qualifyingResults ? (
              <div className="rh-card" style={{ padding: 0 }}>
                {data.qualifyingResults.map((entry) => (
                  <QualifyingResultRow key={entry.driver.id} entry={entry} />
                ))}
              </div>
            ) : (
              <EmptyState icon="⏱️" message="Not available yet." />
            )}

            <div className="rh-section-title">Race results</div>
            {data.raceResults ? (
              <div className="rh-card" style={{ padding: 0 }}>
                {data.raceResults.map((entry) => (
                  <RaceResultRow key={entry.driver.id} entry={entry} />
                ))}
              </div>
            ) : (
              <EmptyState icon="🏁" message="Not available yet." />
            )}
          </>
        )}
      </div>
    </>
  );
}
