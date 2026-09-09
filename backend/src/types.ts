// Держим backend-версии типов отдельно от frontend/src/types/domain.ts
// (разные рантаймы), но контракт должен совпадать 1-в-1.

export type ThemeMode = "telegram" | "light" | "dark";
export type TimeFormat = "24h" | "12h";

export interface UserPreferences {
  favoriteDriverId: string | null;
  favoriteDriver2Id: string | null;
  favoriteConstructorId: string | null;
  themeMode: ThemeMode;
  timeFormat: TimeFormat;
  language: "en" | "ru";
}

export interface NotificationSettings {
  enabled: boolean;
  raceEnabled: boolean;
  raceMinutesBefore: number;
  qualifyingEnabled: boolean;
  qualifyingMinutesBefore: number;
  sprintEnabled: boolean;
  sprintMinutesBefore: number;
  practiceEnabled: boolean;
  practiceMinutesBefore: number;
  resultsEnabled: boolean;
  favoriteDriverResultEnabled: boolean;
  championshipChangeEnabled: boolean;
}

export interface UserProfile {
  id: string;
  timezone: string;
  onboardingCompleted: boolean;
  preferences: UserPreferences;
  notificationSettings: NotificationSettings;
}

// Заглушка нормализованной сущности гоночного уик-энда — совпадает с
// frontend/src/types/domain.ts::RaceWeekend. Реальные данные появятся
// на Этапе 2 вместе с providers/jolpica.ts; сейчас bootstrap отдаёт null.
export type SessionType = "fp1" | "fp2" | "fp3" | "sprint_quali" | "sprint" | "qualifying" | "race";
export type SessionStatus = "upcoming" | "live" | "waiting_for_result" | "completed" | "cancelled";

export interface Session {
  type: SessionType;
  label: string;
  startUtc: string;
  endUtc: string | null;
  status: SessionStatus;
}

export type RaceWeekendStatus = "upcoming" | "current" | "completed" | "cancelled";

export interface RaceWeekend {
  season: number;
  round: number;
  id: string;
  name: string;
  country: string;
  countryCode: string;
  city: string;
  circuit: string;
  // circuitId Jolpica (напр. "monza", "albert_park") — используется фронтом
  // для подбора assets/tracks/<circuitId>.svg. Раньше не прокидывался, из-за
  // чего assetFor.track(w.id) резолвился в "<season>-<round>.svg" и никогда
  // не находил файл — контур трассы всегда падал на плейсхолдер молча.
  circuitId: string;
  sessions: Session[];
  status: RaceWeekendStatus;
}

export interface BootstrapResponse {
  profile: UserProfile;
  nextRace: RaceWeekend | null;
}

// Соответствует frontend/src/types/domain.ts::Driver/Constructor/Standing.
export interface Driver {
  id: string;
  code: string;
  number: number | null;
  firstName: string;
  lastName: string;
  fullName: string;
  nationality: string;
  constructorId: string;
  constructorName: string;
  teamColor: string;
}

export interface Constructor {
  id: string;
  name: string;
  nationality: string;
  color: string;
}

export interface Standing {
  position: number;
  points: number;
  wins: number;
  gapToLeader: number | null;
  movement: "up" | "down" | "same" | "unknown";
  driver?: Pick<Driver, "id" | "fullName" | "code"> & Partial<Pick<Driver, "number" | "constructorId" | "constructorName" | "teamColor">>;
  constructor?: Pick<Constructor, "id" | "name"> & Partial<Pick<Constructor, "color" | "nationality">>;
}

export interface CalendarResponse {
  season: number;
  races: RaceWeekend[];
}

export type StandingsType = "drivers" | "constructors";

export interface StandingsResponse {
  season: number;
  type: StandingsType;
  standings: Standing[];
}

export interface RaceResultEntry {
  position: number;
  positionText: string; // "1".."20" | "R" (retired) | "D" (disqualified) и т.п.
  driver: Pick<Driver, "id" | "fullName" | "code">;
  constructor: Pick<Constructor, "id" | "name">;
  grid: number;
  laps: number;
  status: string; // "Finished" | "+1 Lap" | "Retired" | ... (сырой текст Ergast)
  points: number;
}

export interface QualifyingResultEntry {
  position: number;
  driver: Pick<Driver, "id" | "fullName" | "code">;
  constructor: Pick<Constructor, "id" | "name">;
  q1: string | null;
  q2: string | null;
  q3: string | null;
}

// Источник — OpenF1 (Jolpica принципиально не отдаёт результаты практик,
// см. комментарий у getSprintResults в providers/jolpica.ts). Форма
// заметно проще: нет очков/статуса финиша, только позиция по лучшему кругу
// и отставание от лидера сессии.
export interface PracticeResultEntry {
  position: number;
  positionText: string; // "1".."20" | "DNF" — DNS/DSQ в практиках Ergast-статусов нет, OpenF1 даёт только dnf
  driver: Pick<Driver, "id" | "fullName" | "code">;
  constructor: Pick<Constructor, "id" | "name">;
  bestLapTime: string | null; // "1:21.045", null если пилот не поехал/не показал время
  gapToLeader: string | null; // "+0.351", null для лидера сессии или если время неизвестно
  laps: number;
}

export interface RaceDetailResponse {
  weekend: RaceWeekend;
  raceResults: RaceResultEntry[] | null;
  qualifyingResults: QualifyingResultEntry[] | null;
  sprintResults: RaceResultEntry[] | null;
  // Ключи — только те fp1/fp2/fp3, что реально есть в расписании уик-энда
  // (RaceWeekend.sessions); отсутствующая сессия — отсутствующий ключ, а не
  // null, чтобы фронт мог отличить "сессии нет в расписании" от "результаты
  // сессии ещё не появились".
  practiceResults: Partial<Record<"fp1" | "fp2" | "fp3", PracticeResultEntry[] | null>>;
}
