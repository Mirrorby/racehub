import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";

export function More() {
  const navigate = useNavigate();

  return (
    <>
      <AppHeader title="More" />
      <div className="rh-content">
        <div className="rh-section-title">Preferences</div>
        <div className="rh-card">
          <div className="rh-row" onClick={() => navigate("/drivers")} style={{ cursor: "pointer" }}>
            <span>Favourite driver</span>
            <span style={{ color: "var(--rh-text-secondary)" }}>›</span>
          </div>
          <div className="rh-row" onClick={() => navigate("/constructors")} style={{ cursor: "pointer" }}>
            <span>Favourite team</span>
            <span style={{ color: "var(--rh-text-secondary)" }}>›</span>
          </div>
          <div className="rh-row" onClick={() => navigate("/more/settings")} style={{ cursor: "pointer" }}>
            <span>Notifications</span>
            <span style={{ color: "var(--rh-text-secondary)" }}>›</span>
          </div>
          <div className="rh-row" onClick={() => navigate("/more/theme")} style={{ cursor: "pointer" }}>
            <span>Appearance</span>
            <span style={{ color: "var(--rh-text-secondary)" }}>›</span>
          </div>
        </div>

        <div className="rh-section-title">About</div>
        <p className="rh-disclaimer">
          Race Hub is an unofficial, fan-made companion app. It is not associated with, endorsed by, or
          affiliated with Formula 1, the FIA, or any team or driver referenced within the app. All trademarks
          belong to their respective owners. Data is provided for informational purposes only and may be
          delayed or incomplete.
        </p>
      </div>
    </>
  );
}
