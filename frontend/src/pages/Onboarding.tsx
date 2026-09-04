import { useNavigate } from "react-router-dom";

interface OnboardingProps {
  onComplete: () => void;
}

// TODO(Этап 2): реальный выбор избранного пилота/команды из /api/drivers
// и /api/constructors, вместо кнопки "Skip".

export function Onboarding({ onComplete }: OnboardingProps) {
  const navigate = useNavigate();

  const finish = () => {
    onComplete();
    navigate("/", { replace: true });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        height: "100vh",
        padding: "0 24px",
        gap: 16,
      }}
    >
      <h1 style={{ fontSize: 24 }}>Welcome to Race Hub</h1>
      <p style={{ color: "var(--rh-text-secondary)" }}>
        Follow the calendar, standings and results of your favourite series — right inside Telegram. This is an
        unofficial, fan-made companion app.
      </p>
      <button className="rh-btn-primary" onClick={finish}>
        Get started
      </button>
    </div>
  );
}
