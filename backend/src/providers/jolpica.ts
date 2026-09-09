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
  // Присутствует только когда race вложена в ответ /results/... (напр.
  // getCircuitWinners) — обычный календарный RawRace (getCurrentSeasonRaces
  // и т.п.) этого поля не содержит.
  Results?: RawResult[];
}

export interface RawDriver {
  driverId: string;
  code?: string;
  permanentNumber?: string;
  givenName: string;
  familyName: string;
  nationality: string;
  dateOfBirth?: string;
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

// ---- Карьерная агрегация (пилоты/команды) и история трасс ----
//
// ВАЖНО: у Ergast/Jolpica НЕТ фильтра по финишной позиции для /results/
// (проверено по официальной документации — там есть только season, round,
// circuits, constructors, drivers, fastest, grid, status; "position" среди
// них нет). Поэтому победы/подиумы считаются не через несуществующий
// "/results/1.json", а вручную — постраничным перебором всех результатов
// пилота/команды с агрегацией на нашей стороне.
//
// Также подтверждено: driverStandings/constructorStandings ТРЕБУЮТ сезон
// как обязательный параметр ("Season (required)" в доке) — эндпоинта
// "вся история одним запросом" не существует. Титулы поэтому считаются
// через отдельный цикл по сезонам, а не одним вызовом.

interface TotalOnlyEnvelope {
  MRData: { total: string };
}

interface ResultsPageResponse {
  MRData: { total: string; limit: string; offset: string };
  RaceTable: { Races: Array<{ season: string; Results: Array<{ position: string; points: string }> }> };
}

export interface CareerResultsSummary {
  wins: number;
  podiums: number;
  points: number;
  firstSeason: number | null;
  lastSeason: number | null;
  /** true, если карьера длиннее нашего предела в 500 результатов (~25 полных сезонов) и мы не досчитали до конца — на практике такого в реальной истории F1 пока не бывает, но лучше честно пометить, чем молча занизить. */
  truncated: boolean;
}

/**
 * Агрегирует победы/подиумы/очки/годы карьеры постраничным перебором
 * `/{entityPathPrefix}/results.json`. entityPathPrefix — `/drivers/{id}`
 * или `/constructors/{id}`. Максимум 5 страниц по 100 записей (500
 * результатов — с большим запасом даже для самой длинной карьеры в
 * истории F1, у Хэмилтона на середину 2026 около 370 гонок).
 */
async function aggregateCareerResults(entityPathPrefix: string): Promise<CareerResultsSummary> {
  const pageSize = 100;
  const maxPages = 5;
  let wins = 0;
  let podiums = 0;
  let points = 0;
  let firstSeason = Infinity;
  let lastSeason = -Infinity;
  let truncated = false;

  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize;
    const data = await fetchJson<ResultsPageResponse>(`${entityPathPrefix}/results.json?limit=${pageSize}&offset=${offset}`);
    for (const race of data.RaceTable.Races) {
      const season = Number(race.season);
      firstSeason = Math.min(firstSeason, season);
      lastSeason = Math.max(lastSeason, season);
      for (const result of race.Results) {
        const pos = Number(result.position);
        if (pos === 1) wins++;
        if (pos >= 1 && pos <= 3) podiums++;
        points += Number(result.points);
      }
    }
    const total = Number(data.MRData.total);
    if (offset + pageSize >= total) {
      truncated = false;
      break;
    }
    if (page === maxPages - 1) truncated = true;
  }

  return {
    wins,
    podiums,
    points,
    firstSeason: firstSeason === Infinity ? null : firstSeason,
    lastSeason: lastSeason === -Infinity ? null : lastSeason,
    truncated,
  };
}

export function getDriverCareerResults(driverId: string): Promise<CareerResultsSummary> {
  return aggregateCareerResults(`/drivers/${driverId}`);
}

export function getConstructorCareerResults(constructorId: string): Promise<CareerResultsSummary> {
  return aggregateCareerResults(`/constructors/${constructorId}`);
}

interface QualifyingPageResponse {
  MRData: { total: string };
  RaceTable: { Races: Array<{ QualifyingResults: Array<{ position: string }> }> };
}

/**
 * Число поулов пилота за карьеру. Как и с results, у Ergast/Jolpica нет
 * серверного фильтра "только P1 квалификации" — считаем вручную,
 * постранично (тот же предел в 500 записей).
 */
export async function getCareerPoles(driverId: string): Promise<number> {
  const pageSize = 100;
  const maxPages = 5;
  let poles = 0;
  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize;
    const data = await fetchJson<QualifyingPageResponse>(
      `/drivers/${driverId}/qualifying.json?limit=${pageSize}&offset=${offset}`,
    );
    for (const race of data.RaceTable.Races) {
      if (race.QualifyingResults[0]?.position === "1") poles++;
    }
    const total = Number(data.MRData.total);
    if (offset + pageSize >= total) break;
  }
  return poles;
}

interface SeasonsPayload {
  SeasonTable: { Seasons: Array<{ season: string }> };
}

/** Список сезонов, в которых пилот/команда стартовали хотя бы раз — источник для подсчёта титулов по сезонам. */
export async function getEntitySeasons(entityPathPrefix: string): Promise<number[]> {
  const data = await fetchJson<{ MRData: SeasonsPayload }>(`${entityPathPrefix}/seasons.json?limit=100`);
  return data.MRData.SeasonTable.Seasons.map((s) => Number(s.season));
}

interface DriverStandingsSeasonPayload {
  StandingsTable: { StandingsLists: Array<{ DriverStandings: RawDriverStanding[] }> };
}

/** Итоговая позиция пилота в чемпионате за конкретный сезон (для подсчёта титулов). null, если пилот в этом сезоне не классифицирован (крайне редкий случай). */
export async function getDriverSeasonPosition(season: number, driverId: string): Promise<number | null> {
  const data = await fetchJson<DriverStandingsSeasonPayload>(`/${season}/drivers/${driverId}/driverstandings.json`);
  const entry = data.StandingsTable.StandingsLists[0]?.DriverStandings[0];
  return entry ? Number(entry.position) : null;
}

interface ConstructorStandingsSeasonPayload {
  StandingsTable: { StandingsLists: Array<{ ConstructorStandings: RawConstructorStanding[] }> };
}

export async function getConstructorSeasonPosition(season: number, constructorId: string): Promise<number | null> {
  const data = await fetchJson<ConstructorStandingsSeasonPayload>(
    `/${season}/constructors/${constructorId}/constructorstandings.json`,
  );
  const entry = data.StandingsTable.StandingsLists[0]?.ConstructorStandings[0];
  return entry ? Number(entry.position) : null;
}

interface DriverInfoPayload {
  DriverTable: { Drivers: RawDriver[] };
}

export async function getDriverInfo(driverId: string): Promise<RawDriver | null> {
  const data = await fetchJson<DriverInfoPayload>(`/drivers/${driverId}.json`);
  return data.DriverTable.Drivers[0] ?? null;
}

// ---- История трассы ----

interface CircuitRacesPayload {
  MRData: { total: string };
  RaceTable: { Races: RawRace[] };
}

/** Все гонки на трассе за всю историю (без результатов — только расписание). circuits/{id}/races.json не требует season и пагинируется по гонкам, а не по строкам результатов, поэтому один limit=100 покрывает даже Монцу (~76 Гран-при). */
export async function getCircuitRaces(circuitId: string): Promise<RawRace[]> {
  const data = await fetchJson<CircuitRacesPayload>(`/circuits/${circuitId}/races.json?limit=100`);
  return data.RaceTable.Races;
}

interface CircuitResultsPayload {
  MRData: { total: string };
  RaceTable: { Races: Array<{ season: string; Results: Array<{ position: string; Driver: RawDriver; Constructor: RawConstructor }> }> };
}

/**
 * Полные результаты всех гонок на трассе — используется ТОЛЬКО для
 * "самый успешный пилот/команда на трассе". В отличие от getCircuitRaces,
 * здесь пагинация идёт по строкам результатов (~20 на гонку), поэтому для
 * трасс с длинной историей (Монца, Сильверстоун, Монако — 70+ лет) общее
 * число строк легко превышает максимальный limit=100 за один запрос, а
 * докачивать 10+ страниц ради одной трассы — риск упереться в rate limit
 * (4 req/sec). Поэтому: если всё не помещается в одну страницу — честно
 * возвращаем null ("не считали"), а не частично неверный результат.
 * На практике это означает: для трасс с короткой историей (Майами, Вегас,
 * Джидда, Мадрид) статистика посчитается, для старых легендарных трасс —
 * нет, пока не появится более дешёвый способ её получить.
 */
export async function getCircuitAllResultsIfFits(circuitId: string): Promise<CircuitResultsPayload["RaceTable"]["Races"] | null> {
  const data = await fetchJson<CircuitResultsPayload>(`/circuits/${circuitId}/results.json?limit=100`);
  if (Number(data.MRData.total) > 100) return null;
  return data.RaceTable.Races;
}

interface FastestLapPayload {
  RaceTable: {
    Races: Array<{
      season: string;
      Results: Array<{
        Driver: RawDriver;
        Constructor: RawConstructor;
        FastestLap?: { rank: string; lap: string; Time: { time: string } };
      }>;
    }>;
  };
}

/** Все обладатели быстрейшего круга гонки на трассе за всю историю — источник рекорда круга. Использует документированный фильтр fastest/1 (один ряд на гонку), поэтому пагинация безопасна. FastestLap появился у Ergast только с 2004 года — для трасс без гонок с тех пор вернёт пусто. */
export async function getCircuitFastestLaps(circuitId: string): Promise<FastestLapPayload["RaceTable"]["Races"]> {
  const data = await fetchJson<FastestLapPayload>(`/circuits/${circuitId}/fastest/1/results.json?limit=100`);
  return data.RaceTable.Races;
}
