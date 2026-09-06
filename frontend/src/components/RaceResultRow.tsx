import type { QualifyingResultEntry, RaceResultEntry } from "../types/domain";

export function RaceResultRow({ entry }: { entry: RaceResultEntry }) {
  const isClassified = entry.status === "Finished" || entry.status.startsWith("+");
  return (
    <div className="rh-row">
      <span>
        {entry.positionText} {entry.driver.code} · {entry.constructor.name}
      </span>
      <span style={{ color: isClassified ? "var(--rh-text-primary)" : "var(--rh-text-secondary)", fontSize: 13 }}>
        {isClassified ? `${entry.points} pts` : entry.status}
      </span>
    </div>
  );
}

export function QualifyingResultRow({ entry }: { entry: QualifyingResultEntry }) {
  const bestTime = entry.q3 ?? entry.q2 ?? entry.q1 ?? "—";
  return (
    <div className="rh-row">
      <span>
        {entry.position} {entry.driver.code} · {entry.constructor.name}
      </span>
      <span style={{ color: "var(--rh-text-secondary)", fontSize: 13 }}>{bestTime}</span>
    </div>
  );
}
