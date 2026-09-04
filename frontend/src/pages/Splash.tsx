export function Splash() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        gap: 16,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: "0.08em" }}>RACE HUB</div>
      <div style={{ color: "var(--rh-text-secondary)", fontSize: 13 }}>Loading data...</div>
      <div className="rh-skeleton" style={{ width: 32, height: 32, borderRadius: "50%" }} />
    </div>
  );
}
