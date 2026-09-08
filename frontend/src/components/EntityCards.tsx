import { GlassCard } from "./GlassCard";
import { assetFor, imageFallback, placeholders } from "../assets/assets";
import { useI18n } from "../i18n/I18nContext";
import type { Standing } from "../types/domain";

export function DriverMiniCard({ standing, onOpen }: { standing: Standing; onOpen: () => void }) {
  const d = standing.driver!;
  const { t } = useI18n();
  return <GlassCard className="pp-driver-card" onClick={onOpen} role="button" tabIndex={0}>
    <img className="pp-driver-card__number-graphic" src={assetFor.number(d.id)} onError={(e) => { e.currentTarget.style.display = "none"; }} alt="" />
    <div className="pp-driver-card__number">{d.number ?? d.code}</div>
    <img className="pp-driver-card__portrait" src={assetFor.driver(d.id)} onError={(e) => imageFallback(e, placeholders.driverPlaceholder)} alt="" />
    <div className="pp-driver-card__name">{d.fullName}</div>
    <div className="pp-driver-stats"><div><b>P{standing.position}</b><span>{t("position")}</span></div><div><b>{standing.wins}</b><span>{t("wins")}</span></div><div><b>{standing.points}</b><span>{t("points")}</span></div></div>
  </GlassCard>;
}

export function TeamMiniCard({ standing, onOpen }: { standing: Standing; onOpen: () => void }) {
  const team = standing.constructor!;
  const { t } = useI18n();
  return <GlassCard className="pp-team-card" onClick={onOpen} role="button" tabIndex={0}>
    <img className="pp-team-logo" src={assetFor.team(team.id)} onError={(e) => imageFallback(e, placeholders.teamPlaceholder)} alt="" />
    <h3>{team.name}</h3><div className="pp-driver-stats"><div><b>P{standing.position}</b><span>{t("position")}</span></div><div><b>{standing.points}</b><span>{t("points")}</span></div></div>
    <img className="pp-car" src={assetFor.car(team.id)} onError={(e) => imageFallback(e, placeholders.carPlaceholder)} alt="" />
  </GlassCard>;
}
