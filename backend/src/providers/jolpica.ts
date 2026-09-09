/**
 * Клиент Jolpica F1 API (https://api.jolpi.ca/ergast/f1) — открытая,
 * Ergast-совместимая замена устаревшего Ergast API.
 *
 * Важно (см. https://github.com/jolpica/jolpica-f1/blob/main/docs/README.md):
 * - Обязателен кастомный User-Agent с именем приложения и версией —
 *   без него провайдер не сможет точечно блокировать только "плохие"
 *   версии нашего клиента при инцидентах.
 * - Rate limit: burst 4 req/sec, sustained 500 req/hour
 *   (https://github.com/jolpica/jolpica-f1/blob/main/docs/rate_limits.md).
 *   Т.к. Worker — это множество параллельных изолятов без общей памяти,
 *   полноценный client-side throttling здесь невозможен; вместо этого мы
 *   держим TTL-кэш (см. lib/cache.ts) и ретраим 429 с уважением к
 *   Retry-After, чтобы не усугублять всплеск при холодном кэше.
 */

const BASE_URL = "https://api.jolpi.ca/ergast/f1";
const USER_AGENT = "PodiumPulse/0.2 (+https://github.com/Mirrorby/racehub)";

const MAX_RETRIES = 3;

export class JolpicaApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "JolpicaApiError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(path: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    // 429 (rate limit) и 5xx — временные, имеет смысл повторить.
    // Остальные (4xx) — ретраить бессмысленно, это ошибка запроса.
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === MAX_RETRIES) {
      throw new JolpicaApiError(`Jolpica API ${response.status} for ${path}`, response.status);
    }

    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
    const backoffMs = Number.isFinite(retryAfterMs) ? retryAfterMs : 300 * 2 ** attempt;

    lastError = new JolpicaApiError(`Jolpica API ${response.status} for ${path}`, response.status);
    await sleep(backoffMs);
  }

  throw lastError;
}

// --- Ergast/Jolpica raw response shapes (только поля, которые реально используем) ---

export interface RawSessionTime {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SSZ
}
export interface RawRace {
  season: string;
  round: string;
  raceName: string;
  date: string;
  time?: string;
  Circuit: {
    circuitId: string;
    circuitName: string;
    Location: {
      locality: string;
      country: string;
    };
  };
  FirstPractice?: RawSessionTime;
  SecondPractice?: RawSessionTime;
  ThirdPractice?: RawSessionTime;
  SprintQualifying?: RawSessionTime;
  Sprint?: RawSessionTime;
  Qualifying?: RawSessionTime;
}

export interface RawDriver {
  driverId: string;
  code?: string;
  permanentNumber?: string;
  givenName: string;
  familyName: string;
  nationality: string;
}

export interface RawConstructor {
  constructorId: string;
  name: string;
  nationality: string;
}

export interface RawDriverStanding {
  position: string;
  points: string;
  wins: string;
  Driver: RawDriver;
  Constructors: RawConstructor[];
}

export interface RawConstructorStanding {
  position: string;
  points: string;
  wins: string;
  Constructor: RawConstructor;
}

interface MRDataEnvelope<T> {
  MRData: T;
}

interface RaceTablePayload {
  RaceTable: { season: string; Races: RawRace[] };
}

interface DriverStandingsPayload {
  StandingsTable: { season: string; StandingsLists: Array<{ DriverStandings: RawDriverStanding[] }> };
}

interface ConstructorStandingsPayload {
  StandingsTable: { season: string; StandingsLists: Array<{ ConstructorStandings: RawConstructorStanding[] }> };
}

/** Полный календарь текущего сезона, отсортирован по раунду. */
export async function getCurrentSeasonRaces(): Promise<{ season: number; races: RawRace[] }> {
  const data = await fetchJson<MRDataEnvelope<RaceTablePayload>>("/current.json?limit=40");
  const { season, Races } = data.MRData.RaceTable;
  return { season: Number(season), races: Races };
}

/** Ближайший ещё не начавшийся гоночный уик-энд. */
export async function getNextRace(): Promise<RawRace | null> {
  const data = await fetchJson<MRDataEnvelope<RaceTablePayload>>("/current/next.json");
  return data.MRData.RaceTable.Races[0] ?? null;
}

export async function getDriverStandings(): Promise<{ season: number; standings: RawDriverStanding[] }> {
  const data = await fetchJson<MRDataEnvelope<DriverStandingsPayload>>("/current/driverStandings.json");
  const { season, StandingsLists } = data.MRData.StandingsTable;
  return { season: Number(season), standings: StandingsLists[0]?.DriverStandings ?? [] };
}

export async function getConstructorStandings(): Promise<{ season: number; standings: RawConstructorStanding[] }> {
  const data = await fetchJson<MRDataEnvelope<ConstructorStandingsPayload>>("/current/constructorStandings.json");
  const { season, StandingsLists } = data.MRData.StandingsTable;
  return { season: Number(season), standings: StandingsLists[0]?.ConstructorStandings ?? [] };
}

export interface RawResult {
  position: string;
  positionText: string;
  points: string;
  grid: string;
  laps: string;
  status: string;
  Driver: RawDriver;
  Constructor: RawConstructor;
}

export interface RawQualifyingResult {
  position: string;
  Driver: RawDriver;
  Constructor: RawConstructor;
  Q1?: string;
  Q2?: string;
  Q3?: string;
}

interface ResultsPayload {
  RaceTable: { season: string; Races: Array<{ Results: RawResult[] }> };
}

interface QualifyingPayload {
  RaceTable: { season: string; Races: Array<{ QualifyingResults: RawQualifyingResult[] }> };
}

/** Финишная классификация конкретного этапа. Пусто, пока гонка не завершена. */
export async function getRaceResults(round: number): Promise<RawResult[]> {
  const data = await fetchJson<MRDataEnvelope<ResultsPayload>>(`/current/${round}/results.json`);
  return data.MRData.RaceTable.Races[0]?.Results ?? [];
}

/** Результаты квалификации конкретного этапа. Пусто, пока квала не завершена. */
export async function getQualifyingResults(round: number): Promise<RawQualifyingResult[]> {
  const data = await fetchJson<MRDataEnvelope<QualifyingPayload>>(`/current/${round}/qualifying.json`);
  return data.MRData.RaceTable.Races[0]?.QualifyingResults ?? [];
}

// Sprint-гонка имеет ту же форму результата, что и обычная гонка (позиция,
// сетка, круги, статус, очки) — Ergast/Jolpica используют идентичную схему
// RawResult под именем SprintResults. Спринт-квалификацию (SQ1/SQ2/SQ3)
// Jolpica пока не отдаёт отдельным эндпоинтом (см. discussions/128 в
// jolpica-f1 — мейнтейнеры подтвердили, что это не планируется для
// существующих /ergast эндпоинтов), поэтому для неё используем не этот
// провайдер, а OpenF1 в отдельном сервисе.
interface SprintPayload {
  RaceTable: { season: string; Races: Array<{ SprintResults: RawResult[] }> };
}

/** Результаты спринт-гонки конкретного этапа. Пусто, если спринта на этом уик-энде нет или он не завершён. */
export async function getSprintResults(round: number): Promise<RawResult[]> {
  const data = await fetchJson<MRDataEnvelope<SprintPayload>>(`/current/${round}/sprint.json`);
  return data.MRData.RaceTable.Races[0]?.SprintResults ?? [];
}
