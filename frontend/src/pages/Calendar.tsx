import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { EmptyState } from "../components/EmptyState";

// TODO(Этап 2): подключить /api/calendar?season=YYYY через TanStack Query,
// как только backend/src/providers/jolpica.ts будет реализован.

export function Calendar() {
  const navigate = useNavigate();

  return (
    <>
      <AppHeader title="Calendar" />
      <div className="rh-content">
        <EmptyState
          icon="📅"
          message="Full season calendar will appear here once the data layer is connected."
          action={
            <button className="rh-btn-primary" style={{ width: "auto" }} onClick={() => navigate("/")}>
              Back to Home
            </button>
          }
        />
      </div>
    </>
  );
}
