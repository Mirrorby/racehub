import type { SessionStatus } from "../types/domain";

const LABELS: Record<SessionStatus, string> = {
  upcoming: "Upcoming",
  live: "In progress",
  waiting_for_result: "Awaiting result",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span className="rh-status-badge" data-status={status}>
      {LABELS[status]}
    </span>
  );
}
