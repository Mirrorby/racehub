import type { Standing } from "../types/domain";

export function StandingRow({ standing }: { standing: Standing }) {
  const label = standing.driver?.fullName ?? standing.constructor?.name ?? "—";

  return (
    <div className="rh-row">
      <span>
        {standing.position} {label}
      </span>
      <span style={{ fontWeight: 600 }}>{standing.points}</span>
    </div>
  );
}
