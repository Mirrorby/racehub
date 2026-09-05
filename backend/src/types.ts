// Держим backend-версии типов отдельно от frontend/src/types/domain.ts
// (разные рантаймы), но контракт должен совпадать 1-в-1.

export type ThemeMode = "telegram" | "light" | "dark";
export type TimeFormat = "24h" | "12h";

export interface UserPreferences {
  favoriteDriverId: string | null;
  favoriteConstructorId: string | null;
  themeMode: ThemeMode;
  timeFormat: TimeFormat;
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
  driver?: Pick<Driver, "id" | "fullName" | "code">;
  constructor?: Pick<Constructor, "id" | "name">;
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
