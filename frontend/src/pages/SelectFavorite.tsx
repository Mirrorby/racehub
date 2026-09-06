import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Skeleton } from "../components/Skeleton";
import { useBootstrap } from "../hooks/useBootstrap";
import { useStandings } from "../hooks/useStandings";
import { useUpdatePreferences } from "../hooks/useUpdatePreferences";
import type { StandingsType } from "../api/standings";

interface SelectFavoriteProps {
  type: StandingsType;
}

/**
 * Отдельного справочника пилотов/команд нет — используем стандинги
 * текущего сезона (уже загружаются для Standings-страницы и содержат
 * всё нужное: id, имя, очки для контекста). Если понадобится выбирать
 * пилота вне текущего сезона — тогда обосновано заводить /api/drivers.
 */
export function SelectFavorite({ type }: SelectFavoriteProps) {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useStandings(type);
  const bootstrap = useBootstrap();
  const mutation = useUpdatePreferences();

  const isDriver = type === "drivers";
  const currentId = isDriver
    ? bootstrap.data?.profile.preferences.favoriteDriverId
    : bootstrap.data?.profile.preferences.favoriteConstructorId;

  function select(id: string) {
    const nextId = currentId === id ? null : id; // повторный тап — снять выбор
    mutation.mutate(isDriver ? { favoriteDriverId: nextId } : { favoriteConstructorId: nextId }, {
      onSuccess: () => navigate("/more"),
    });
  }

  return (
    <>
      <AppHeader
        title={isDriver ? "Favourite driver" : "Favourite team"}
        action={
          <button onClick={() => navigate("/more")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>
            ‹ Back
          </button>
        }
      />
      <div className="rh-content">
        {isLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        )}

        {isError && <ErrorState onRetry={() => refetch()} />}

        {data && data.standings.length === 0 && <EmptyState message="No data available right now." />}

        {mutation.isError && (
          <p style={{ color: "var(--rh-danger, #e5484d)", fontSize: 13, marginBottom: 12 }}>
            Couldn't save your choice — check your connection and try again.
          </p>
        )}

        {data && data.standings.length > 0 && (
          <div className="rh-card" style={{ padding: 0, opacity: mutation.isPending ? 0.6 : 1 }}>
            {data.standings.map((standing) => {
              const id = (isDriver ? standing.driver?.id : standing.constructor?.id) ?? "";
              const label = isDriver ? standing.driver?.fullName : standing.constructor?.name;
              const selected = id === currentId;
              return (
                <button
                  key={id || standing.position}
                  onClick={() => id && select(id)}
                  disabled={mutation.isPending}
                  className="rh-row"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    borderBottom: "1px solid var(--rh-border)",
                    cursor: "pointer",
                    color: "inherit",
                    font: "inherit",
                  }}
                >
                  <span>
                    {standing.position} {label}
                  </span>
                  {selected && <span aria-hidden>✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
