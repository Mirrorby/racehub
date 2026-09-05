import type { RawRace, RawSessionTime } from "../providers/jolpica";
import type { RaceWeekend, RaceWeekendStatus, Session, SessionStatus, SessionType } from "../types";
import { countryNameToIsoCode } from "./countryCode";

// Условная максимальная длительность сессии — у Ergast есть только время
// начала, конца нет. Достаточно для статуса "live" в UI; не претендует на
// точность до минуты. Гонка идёт дольше практик/квалификации, поэтому её
// оцениваем отдельно (макс. 3ч с учётом регламентного лимита + возможный ред флаг).
const SESSION_DURATION_MS: Record<SessionType, number> = {
  fp1: 90 * 60 * 1000,
  fp2: 90 * 60 * 1000,
  fp3: 60 * 60 * 1000,
  sprint_quali: 60 * 60 * 1000,
  sprint: 60 * 60 * 1000,
  qualifying: 60 * 60 * 1000,
  race: 3 * 60 * 60 * 1000,
};

const SESSION_LABELS: Record<SessionType, string> = {
  fp1: "Practice 1",
  fp2: "Practice 2",
  fp3: "Practice 3",
  sprint_quali: "Sprint Qualifying",
  sprint: "Sprint",
  qualifying: "Qualifying",
  race: "Race",
};

function toIso(session: RawSessionTime): string {
  return `${session.date}T${session.time}`;
}

function sessionStatus(startIso: string, type: SessionType, now: Date): SessionStatus {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + SESSION_DURATION_MS[type]);

  if (now < start) return "upcoming";
  if (now <= end) return "live";
  // Между концом сессии и публикацией официальных результатов проходит
  // время (особенно после гонки, при разборах/пенальти) — считаем это
  // отдельным статусом, чтобы фронт не показывал "upcoming"/"live" зря.
  const resultsGraceMs = type === "race" ? 30 * 60 * 1000 : 15 * 60 * 1000;
  if (now <= new Date(end.getTime() + resultsGraceMs)) return "waiting_for_result";
  return "completed";
}

function buildSessions(raw: RawRace, now: Date): Session[] {
  const entries: Array<[SessionType, RawSessionTime | undefined]> = [
    ["fp1", raw.FirstPractice],
    // До 2023: "SecondPractice" — это реальная FP2. С 2023/2024 на sprint-уикендах
    // тот же ключ используют под спринт-квалу — но тогда Ergast присылает
    // отдельно ещё и SprintQualifying, так что таких недель просто нет
    // одновременно двух значений в одном сырье; ключ SecondPractice в тот
    // момент физически отсутствует. Поэтому маппинг безопасен как есть.
    ["fp2", raw.SecondPractice],
    ["fp3", raw.ThirdPractice],
    ["sprint_quali", raw.SprintQualifying],
    ["sprint", raw.Sprint],
    ["qualifying", raw.Qualifying],
    ["race", { date: raw.date, time: raw.time ?? "00:00:00Z" }],
  ];

  return entries
    .filter((entry): entry is [SessionType, RawSessionTime] => Boolean(entry[1]))
    .map(([type, session]) => {
      const startUtc = toIso(session);
      return {
        type,
        label: SESSION_LABELS[type],
        startUtc,
        endUtc: null,
        status: sessionStatus(startUtc, type, now),
      };
    })
    .sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}

function weekendStatus(sessions: Session[]): RaceWeekendStatus {
  if (sessions.every((s) => s.status === "completed")) return "completed";
  if (sessions.every((s) => s.status === "upcoming")) return "upcoming";
  return "current";
}

export function mapRaceWeekend(raw: RawRace, now: Date = new Date()): RaceWeekend {
  const sessions = buildSessions(raw, now);
  return {
    season: Number(raw.season),
    round: Number(raw.round),
    id: `${raw.season}-${raw.round}`,
    name: raw.raceName,
    country: raw.Circuit.Location.country,
    countryCode: countryNameToIsoCode(raw.Circuit.Location.country),
    city: raw.Circuit.Location.locality,
    circuit: raw.Circuit.circuitName,
    sessions,
    status: weekendStatus(sessions),
  };
}
