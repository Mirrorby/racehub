interface FavoriteButtonProps {
  active: boolean;
  onToggle: () => void;
  label?: string;
}

export function FavoriteButton({ active, onToggle, label }: FavoriteButtonProps) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={active}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        fontSize: 20,
        color: active ? "var(--rh-accent)" : "var(--rh-text-secondary)",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span>{active ? "★" : "☆"}</span>
      {label && <span style={{ fontSize: 13 }}>{label}</span>}
    </button>
  );
}
