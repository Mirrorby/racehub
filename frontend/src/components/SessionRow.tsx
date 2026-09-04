import type { Session } from "../types/domain";

export function SessionRow({ session, onOpen }: { session: Session; onOpen?: () => void }) {
  const mark = session.status === "completed" ? "✓" : session.status === "live" ? "●" : "•";

  return (
    <div className="rh-row" onClick={onOpen} style={{ cursor: onOpen ? "pointer" : "default" }}>
      <span>
        {mark} {session.label}
      </span>
      <span style={{ color: "var(--rh-text-secondary)" }}>
        {new Date(session.startUtc).toLocaleString(undefined, {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </div>
  );
}
