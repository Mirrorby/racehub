import type { Session } from "../types/domain";
import { useI18n, formatLocalDate } from "../i18n/I18nContext";

export function SessionRow({ session, onOpen }: { session: Session; onOpen?: () => void }) {
  const { t } = useI18n();
  const status = session.status === "completed" ? t("results") : session.status === "live" ? t("live") : t("upcoming");

  return (
    <div className="rh-row pp-session" onClick={onOpen} style={{ cursor: onOpen ? "pointer" : "default" }}>
      <div><div className="pp-session__name">{session.label}</div><div className="pp-session__status rh-status-badge" data-status={session.status === "live" ? "live" : session.status === "completed" ? "completed" : "upcoming"}>{session.status === "live" && <span className="pp-live-dot" />}{status}</div></div>
      <div className="pp-session__time">{formatLocalDate(session.startUtc, t("locale"), { weekday: "short", day: "numeric", month: "short" })}<br />{formatLocalDate(session.startUtc, t("locale"), { hour: "numeric", minute: "2-digit" })}</div>
    </div>
  );
}
