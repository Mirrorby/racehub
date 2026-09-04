import type { RaceWeekend } from "../types/domain";
import { Countdown } from "./Countdown";

function nextUpcomingSession(weekend: RaceWeekend) {
  return weekend.sessions.find((s) => s.status === "upcoming" || s.status === "live") ?? weekend.sessions[0];
}

export function RaceCard({ weekend, onOpen }: { weekend: RaceWeekend; onOpen: () => void }) {
  const next = nextUpcomingSession(weekend);

  return (
    <button className="rh-card" onClick={onOpen} style={{ width: "100%", textAlign: "left", cursor: "pointer" }}>
      <div style={{ fontWeight: 700, fontSize: 16 }}>
        {weekend.countryCode ? `${flagEmoji(weekend.countryCode)} ` : ""}
        {weekend.name}
      </div>
      <div style={{ color: "var(--rh-text-secondary)", fontSize: 13, marginTop: 2 }}>{weekend.city}</div>

      {next && (
        <>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 12 }}>
            <Countdown targetUtc={next.startUtc} />
          </div>
          <div style={{ color: "var(--rh-text-secondary)", fontSize: 13, marginTop: 2 }}>
            Next: {next.label} • {formatWeekday(next.startUtc)}
          </div>
        </>
      )}

      <div style={{ marginTop: 12, color: "var(--rh-accent)", fontWeight: 600, fontSize: 13 }}>View →</div>
    </button>
  );
}

function formatWeekday(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** ISO 3166-1 alpha-2 -> emoji flag. Без обращения к сторонним ассетам/иконкам F1. */
function flagEmoji(countryCode: string): string {
  if (countryCode.length !== 2) return "";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}
