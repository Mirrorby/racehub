import { useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { EmptyState } from "../components/EmptyState";

type Tab = "drivers" | "constructors";

// TODO(Этап 2): подключить /api/standings/{drivers|constructors}?season=YYYY.

export function Standings() {
  const [tab, setTab] = useState<Tab>("drivers");

  return (
    <>
      <AppHeader title="Standings" />
      <div className="rh-content">
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <TabButton active={tab === "drivers"} onClick={() => setTab("drivers")} label="Drivers" />
          <TabButton active={tab === "constructors"} onClick={() => setTab("constructors")} label="Constructors" />
        </div>

        <EmptyState message={`${tab === "drivers" ? "Driver" : "Constructor"} standings will appear here once the data layer is connected.`} />
      </div>
    </>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "8px 0",
        borderRadius: "var(--rh-radius-sm)",
        border: "1px solid var(--rh-border)",
        background: active ? "var(--rh-accent)" : "transparent",
        color: active ? "var(--rh-accent-contrast)" : "var(--rh-text-primary)",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
