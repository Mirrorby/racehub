import { useNavigate } from "react-router-dom";
import { useBootstrap } from "../hooks/useBootstrap";
import { useStandings } from "../hooks/useStandings";
import { GlassCard } from "../components/GlassCard";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { Countdown } from "../components/Countdown";
import { SessionRow } from "../components/SessionRow";
import { DriverMiniCard, TeamMiniCard } from "../components/EntityCards";
import { TrackOutline } from "../components/TrackOutline";
import { useI18n, formatLocalDate } from "../i18n/I18nContext";

export function Home() {
  const { data, isLoading, isError, refetch } = useBootstrap();
  const drivers = useStandings("drivers"); const teams = useStandings("constructors");
  const navigate = useNavigate(); const { t } = useI18n();
  if (isLoading) return <div className="rh-content"><Spinner /></div>;
  if (isError) return <div className="rh-content"><ErrorState onRetry={() => refetch()} /></div>;
  const prefs = data?.profile.preferences;
  const selectedDrivers = [prefs?.favoriteDriverId, prefs?.favoriteDriver2Id].map(id => drivers.data?.standings.find(s => s.driver?.id === id)).filter(Boolean);
  const selectedTeam = teams.data?.standings.find(s => s.constructor?.id === prefs?.favoriteConstructorId);
  const next = data?.nextRace?.sessions.find(s => s.status === "live" || s.status === "upcoming");
  return <div className="rh-content">
    <div className="pp-wordmark">Podium Pulse</div>
    <div className="rh-section-title">{t("nextWeekend")}</div>
    {data?.nextRace ? <GlassCard className="pp-next" onClick={() => navigate(`/race/${data.nextRace!.id}`)} role="button">
      <div><div className="pp-kicker">{data.nextRace.city} · {data.nextRace.country}</div><h1>{data.nextRace.name}</h1><div className="pp-muted">{data.nextRace.circuit}</div>
      {next && <><div className="pp-countdown"><Countdown targetUtc={next.startUtc} /></div><div className="pp-muted">{next.label} · {formatLocalDate(next.startUtc,t("locale"),{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"})}</div></>}</div>
      <TrackOutline className="pp-track-outline" circuitId={data.nextRace.circuitId} />
    </GlassCard> : <EmptyState message={t("noData")} />}
    {data?.nextRace && <><div className="rh-section-title">{t("weekend")}</div><GlassCard>{data.nextRace.sessions.map(session=><SessionRow key={session.type} session={session} onOpen={()=>navigate(`/race/${data.nextRace!.id}?session=${session.type}`)} />)}</GlassCard></>}
    <div className="rh-section-title">{t("yourDrivers")}</div>
    {selectedDrivers.length === 2 ? <div className="pp-person-grid">{selectedDrivers.map(s=><DriverMiniCard key={s!.driver!.id} standing={s!} onOpen={()=>navigate(`/driver/${s!.driver!.id}`)} />)}</div> : <GlassCard className="pp-placeholder"><p>{t("selectDrivers")}</p><button className="rh-btn-primary" onClick={()=>navigate("/personalization")}>{t("choose")}</button></GlassCard>}
    <div className="rh-section-title">{t("yourTeam")}</div>
    {selectedTeam ? <TeamMiniCard standing={selectedTeam} onOpen={()=>navigate(`/team/${selectedTeam.constructor!.id}`)} /> : <GlassCard className="pp-placeholder"><p>{t("selectTeam")}</p><button className="rh-btn-primary" onClick={()=>navigate("/personalization")}>{t("choose")}</button></GlassCard>}
  </div>;
}
