import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { Skeleton } from "../components/Skeleton";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { RaceCard } from "../components/RaceCard";
import { SessionRow } from "../components/SessionRow";
import { useBootstrap } from "../hooks/useBootstrap";

export function Home() {
  const { data, isLoading, isError, refetch } = useBootstrap();
  const navigate = useNavigate();

  return (
    <>
      <AppHeader title="Race Hub" action={<button onClick={() => navigate("/more/settings")}>⚙</button>} />
      <div className="rh-content">
        {isLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Skeleton height={140} />
            <Skeleton height={100} />
            <Skeleton height={100} />
          </div>
        )}

        {isError && <ErrorState onRetry={() => refetch()} />}

        {data && (
          <>
            <div className="rh-section-title">Next</div>
            {data.nextRace ? (
              <RaceCard weekend={data.nextRace} onOpen={() => navigate(`/race/${data.nextRace!.id}`)} />
            ) : (
              <EmptyState message="Next race data isn't available yet. Check back soon." />
            )}

            {data.nextRace && (
              <>
                <div className="rh-section-title">Weekend</div>
                <div className="rh-card">
                  {data.nextRace.sessions.map((session) => (
                    <SessionRow key={session.type} session={session} />
                  ))}
                </div>
              </>
            )}

            <div className="rh-section-title">Your driver</div>
            {data.profile.preferences.favoriteDriverId ? (
              <div className="rh-card" style={{ color: "var(--rh-text-secondary)" }}>
                Driver stats will appear here once the data layer is connected.
              </div>
            ) : (
              <EmptyState
                message="Choose your favourite driver"
                action={
                  <button className="rh-btn-primary" style={{ width: "auto" }} onClick={() => navigate("/drivers")}>
                    Select driver
                  </button>
                }
              />
            )}

            <div className="rh-section-title">Championship</div>
            <EmptyState message="Standings will appear here once the data layer is connected." />
          </>
        )}
      </div>
    </>
  );
}
