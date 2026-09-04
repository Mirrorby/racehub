interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = "Something went wrong. Please try again.", onRetry }: ErrorStateProps) {
  return (
    <div className="rh-error-state">
      <span style={{ fontSize: 28 }}>⚠️</span>
      <p>{message}</p>
      {onRetry && (
        <button className="rh-btn-primary" style={{ width: "auto", padding: "8px 20px" }} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
