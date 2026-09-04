interface EmptyStateProps {
  icon?: string;
  message: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon = "🏁", message, action }: EmptyStateProps) {
  return (
    <div className="rh-empty-state">
      <span style={{ fontSize: 28 }}>{icon}</span>
      <p>{message}</p>
      {action}
    </div>
  );
}
