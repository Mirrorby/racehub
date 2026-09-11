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
  // Официальный цвет команды, как его показывает трансляция F1 (без "#",
  // напр. "F47600"). Источник живой и не требует ручного обновления по
  // межсезоньям — предпочтительнее статичной таблицы в mappers/teamColors.ts,
  // которую используем только как fallback, если OpenF1 недоступен.
  team_colour: string;
}

export interface RawOpenF1SessionResult {
  position: number | null; // null у DSQ/DNS — сессия не насчитала позицию
  driver_number: number;
  number_of_laps: number | null;
  points: number;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
  // Лучший круг (практики) или суммарное время (гонка) — обычно одно
  // число. Но для сессий типа "квалификация" (Qualifying/Sprint
  // Qualifying) OpenF1 отдаёт МАССИВ [Q1,Q2,Q3]/[SQ1,SQ2,SQ3] — это
  // подтверждено вживую тестовой фикстурой реального Rust-клиента openf1
  // (docs.rs/crate/openf1), а не догадкой. См. unwrapFlexibleNumber ниже.
  duration: number | number[] | null;
  gap_to_leader: number | number[] | null;
}

/**
 * Схлопывает "гибкое" поле OpenF1 (число | массив по стадиям квалы | null)
 * в единственное число — берём последний элемент массива, т.е. время/гэп
 * той стадии, до которой пилот реально доехал (Q1-вылетевший -> его Q1,
 * добравшийся до Q3 -> его Q3). Та же логика, что в проверенном openf1
 * Rust-крейте (serde_helpers::optional_f64_flexible).
 */
export function unwrapFlexibleNumber(value: number | number[] | null): number | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const last = value.length > 0 ? value[value.length - 1] : null;
    return last ?? null;
  }
  return value;
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
  sessionName: "Race" | "Qualifying" | "Sprint" | "Sprint Qualifying" | "Practice 1" | "Practice 2" | "Practice 3",
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

export interface RawOpenF1Lap {
  driver_number: number;
  lap_number: number;
  // Может быть null даже для реально пройденного круга — известный
  // пробел в самом OpenF1 (см. issue #30 в их репозитории), не наша
  // ошибка парсинга. Отфильтровываем такие круги, а не считаем их 0.
  lap_duration: number | null;
  is_pit_out_lap: boolean;
}

/**
 * Круги пилотов за сессию. Единственный надёжный способ получить
 * результаты практик: `/session_result` документирован как поддерживающий
 * все типы сессий, но по факту (подтверждено несколькими независимыми
 * источниками, включая официальную оговорку OpenF1 "Practice sessions:
 * Limited data compared to races") для практик он либо пуст, либо
 * ненадёжен. Практики поэтому считаем сами: лучший круг = минимальный
 * lap_duration среди кругов, не являющихся выездом из пит-лейна.
 */
export async function getLaps(sessionKey: number): Promise<RawOpenF1Lap[]> {
  return fetchJson<RawOpenF1Lap[]>(`/laps?session_key=${sessionKey}`);
}

export interface RawOpenF1Position {
  driver_number: number;
  position: number;
  date: string;
}

/**
 * Позиции пилотов в сессии как последовательность изменений (запись
 * добавляется только когда позиция меняется, не непрерывно). Чтобы
 * получить финальную позицию на конец сессии — берём запись с самой
 * поздней датой на каждого пилота.
 */
export async function getPositions(sessionKey: number): Promise<RawOpenF1Position[]> {
  return fetchJson<RawOpenF1Position[]>(`/position?session_key=${sessionKey}`);
}
