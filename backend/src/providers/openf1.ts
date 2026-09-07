/**
 * Клиент OpenF1 (https://openf1.org) — открытый бесплатный API без ключей,
 * используется как "быстрый путь" для результатов гонки и текущих
 * standings. По документации OpenF1, `/session_result` появляется
 * "a few minutes after the official results are published on the
 * official Formula 1 website" — на порядки быстрее, чем batch-обновления
 * Jolpica (та по своим словам целится в "раз в неделю, в понедельник
 * после гонки", см. https://github.com/jolpica/jolpica-f1/discussions/95).
 *
 * OpenF1 работает с собственными идентификаторами (driver_number,
 * session_key), не совпадающими с driverId/constructorId из Ergast/
 * Jolpica — сведение id делает services/liveResultsService.ts через
 * трёхбуквенный код пилота (name_acronym в OpenF1 == code в Ergast),
 * который одинаков в обеих системах и присваивается FIA один раз.
 */

const BASE_URL = "https://api.openf1.org/v1";

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`OpenF1 API ${response.status} for ${path}`);
  }
  return (await response.json()) as T;
}

export interface RawOpenF1Session {
  session_key: number;
  meeting_key: number;
  session_name: string; // "Race" | "Qualifying" | "Sprint" | "Practice 1" | ...
  session_type: string;
  date_start: string; // ISO
  year: number;
}

export interface RawOpenF1Driver {
  driver_number: number;
  full_name: string;
  name_acronym: string; // например "VER" — совпадает с Driver.code у Ergast/Jolpica
  team_name: string;
}

export interface RawOpenF1SessionResult {
  position: number;
  driver_number: number;
  number_of_laps: number;
  points: number;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
}

export interface RawOpenF1StartingGridEntry {
  driver_number: number;
  position: number;
}

export interface RawOpenF1ChampionshipDriver {
  driver_number: number;
  points_current: number;
  position_current: number;
}

export interface RawOpenF1ChampionshipTeam {
  team_name: string;
  points_current: number;
  position_current: number;
}

const SESSION_MATCH_TOLERANCE_MS = 12 * 60 * 60 * 1000;

/**
 * OpenF1 не знает про season/round из Ergast — сопоставляем сессию по
 * ближайшему времени старта к уже известному нам (из Jolpica-календаря)
 * расписанию. В пределах 12 часов — более чем достаточный запас, при этом
 * исключает случайное совпадение с другим этапом сезона.
 */
export async function findSession(
  year: number,
  sessionName: "Race" | "Qualifying",
  targetIso: string,
): Promise<RawOpenF1Session | null> {
  let sessions: RawOpenF1Session[];
  try {
    sessions = await fetchJson<RawOpenF1Session[]>(
      `/sessions?year=${year}&session_name=${encodeURIComponent(sessionName)}`,
    );
  } catch {
    return null;
  }

  const target = new Date(targetIso).getTime();
  let best: RawOpenF1Session | null = null;
  let bestDiff = Infinity;
  for (const session of sessions) {
    const diff = Math.abs(new Date(session.date_start).getTime() - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = session;
    }
  }
  return best && bestDiff <= SESSION_MATCH_TOLERANCE_MS ? best : null;
}

export async function getSessionResult(sessionKey: number): Promise<RawOpenF1SessionResult[]> {
  return fetchJson<RawOpenF1SessionResult[]>(`/session_result?session_key=${sessionKey}`);
}

export async function getStartingGrid(sessionKey: number): Promise<RawOpenF1StartingGridEntry[]> {
  return fetchJson<RawOpenF1StartingGridEntry[]>(`/starting_grid?session_key=${sessionKey}`);
}

export async function getSessionDrivers(sessionKey: number): Promise<RawOpenF1Driver[]> {
  return fetchJson<RawOpenF1Driver[]>(`/drivers?session_key=${sessionKey}`);
}

export async function getChampionshipDrivers(sessionKey: number): Promise<RawOpenF1ChampionshipDriver[]> {
  return fetchJson<RawOpenF1ChampionshipDriver[]>(`/championship_drivers?session_key=${sessionKey}`);
}

export async function getChampionshipTeams(sessionKey: number): Promise<RawOpenF1ChampionshipTeam[]> {
  return fetchJson<RawOpenF1ChampionshipTeam[]>(`/championship_teams?session_key=${sessionKey}`);
}
