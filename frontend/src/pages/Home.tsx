import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { Skeleton } from "../components/Skeleton";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { RaceCard } from "../components/RaceCard";
import { SessionRow } from "../components/SessionRow";
import { StandingRow } from "../components/StandingRow";
import { useBootstrap } from "../hooks/useBootstrap";
import { useStandings } from "../hooks/useStandings";

const TOP_STANDINGS_PREVIEW = 3;

export function Home() {
  const { data, isLoading, isError, refetch } = useBootstrap();
  const standings = useStandings("drivers");
  const navigate = useNavigate();

  const favoriteDriverId = data?.profile.preferences.favoriteDriverId ?? null;
  const favoriteStanding = favoriteDriverId
    ? standings.data?.standings.find((s) => s.driver?.id === favoriteDriverId)
    : undefined;

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
              <RaceCard weekend={data.nextRace} onOpen={() => navigate(`/calendar`)} />
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
            {favoriteDriverId ? (
              favoriteStanding ? (
                <div className="rh-card" style={{ padding: 0 }}>
                  <StandingRow standing={favoriteStanding} />
                </div>
              ) : (
                <Skeleton height={48} />
              )
            ) : (
              <EmptyState
                message="Choose your favourite driver"
                action={
                  <button className="rh-btn-primary" style={{ width: "auto" }} onClick={() => navigate("/more")}>
                    Select driver
                  </button>
                }
              />
            )}

            <div className="rh-section-title">Championship</div>
            {standings.isLoading && <Skeleton height={40 * TOP_STANDINGS_PREVIEW} />}
            {standings.isError && <ErrorState onRetry={() => standings.refetch()} />}
            {standings.data && (
              <div className="rh-card" style={{ padding: 0, cursor: "pointer" }} onClick={() => navigate("/standings")}>
                {standings.data.standings.slice(0, TOP_STANDINGS_PREVIEW).map((standing) => (
                  <StandingRow key={standing.driver?.id ?? standing.position} standing={standing} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
