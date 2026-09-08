import { useNavigate } from "react-router-dom";
import { useCalendar } from "../hooks/useCalendar";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { GlassCard } from "../components/GlassCard";
import { StatusBadge } from "../components/StatusBadge";
import { TrackOutline } from "../components/TrackOutline";
import { useI18n, formatLocalDate } from "../i18n/I18nContext";

function flag(code:string){return code.length===2?String.fromCodePoint(...code.toUpperCase().split("").map(c=>127397+c.charCodeAt(0))):""}
export function Calendar(){const {data,isLoading,isError,refetch}=useCalendar();const nav=useNavigate();const {t}=useI18n();return <div className="rh-content"><div className="pp-wordmark">Podium Pulse</div><h1 className="pp-page-title">{t("calendar")} {data?.season}</h1>{isLoading&&<Spinner/>}{isError&&<ErrorState onRetry={()=>refetch()}/>} {data?.races.length===0&&<EmptyState message={t("noData")}/>}<div className="pp-calendar-list">{data?.races.map(r=>{const race=r.sessions.find(s=>s.type==="race");const status=r.status==="completed"?"completed":r.status==="current"?"live":"upcoming";return <GlassCard key={r.id} className={`pp-race-card ${r.status==="current"?"pp-glass--current":""}`} onClick={()=>nav(`/race/${r.id}`)} role="button"><div className="pp-kicker">{flag(r.countryCode)} {r.city} · {r.country}</div><h3>{r.name}</h3><div className="pp-muted">{race&&formatLocalDate(race.startUtc,t("locale"),{day:"numeric",month:"short"})}</div><TrackOutline className="pp-track-outline" circuitId={r.circuitId} animated={r.status==="current"}/><div className="pp-race-card__footer"><span className="pp-muted">{t("round")} {r.round}</span><StatusBadge status={status}/></div></GlassCard>})}</div></div>}
