import type { SessionStatus } from "../types/domain";
import { useI18n } from "../i18n/I18nContext";

export function StatusBadge({ status }: { status: SessionStatus }) {
  const { t } = useI18n();
  const label = status === "live" ? t("live") : status === "completed" ? t("finished") : status === "upcoming" ? t("upcoming") : status.replace(/_/g, " ");
  return (
    <span className="rh-status-badge" data-status={status}>
      {status === "live" && <span className="pp-live-dot" />}{label}
    </span>
  );
}
