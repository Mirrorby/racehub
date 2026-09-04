// Отражает "Нормализованные сущности backend" из ТЗ (раздел 12).
// Frontend не должен зависеть от исходного JSON Jolpica/OpenF1 —
// эти типы соответствуют ответам backend REST API.

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

export interface Standing {
  position: number;
  points: number;
  wins: number;
  gapToLeader: number | null;
  movement: "up" | "down" | "same" | "unknown";
  driver?: Pick<Driver, "id" | "fullName" | "code">;
  constructor?: Pick<Constructor, "id" | "name">;
}

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

export interface BootstrapResponse {
  profile: UserProfile;
  nextRace: RaceWeekend | null;
}
