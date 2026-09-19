import type { RaceResultEntry, RaceWeekend, Session, SessionType, Standing } from "../types";

export type NotificationLang = "en" | "ru";

/**
 * Раньше все push-уведомления уходили только на английском, независимо от
 * user_preferences.language — единственное место в приложении, которое не
 * уважало выбор языка (весь остальной UI переведён через frontend/src/i18n).
 * Обнаружено 16.09.2026 при аудите.
 *
 * Держим это отдельно от frontend/src/i18n/I18nContext.tsx: там React-контекст
 * для UI-текста, здесь — обычные функции для текста Telegram-сообщений
 * (другой рантайм, другой набор строк, общего смысла делить один модуль на
 * два фреймворка нет).
 */
const SESSION_LABEL: Record<NotificationLang, Record<SessionType, string>> = {
  en: {
    fp1: "Practice 1",
    fp2: "Practice 2",
    fp3: "Practice 3",
    sprint_quali: "Sprint Qualifying",
    sprint: "Sprint",
    qualifying: "Qualifying",
    race: "Race",
  },
  ru: {
    fp1: "Практика 1",
    fp2: "Практика 2",
    fp3: "Практика 3",
    sprint_quali: "Спринт-квалификация",
    sprint: "Спринт",
    qualifying: "Квалификация",
    race: "Гонка",
  },
};

function sessionEmoji(type: SessionType): string {
  if (type === "race") return "🏁";
  if (type === "qualifying" || type === "sprint_quali") return "⏱️";
  if (type === "sprint") return "🚀";
  return "🔧";
}

export function formatSessionReminder(lang: NotificationLang, weekend: RaceWeekend, session: Session, minutesBefore: number): string {
  const emoji = sessionEmoji(session.type);
  const label = SESSION_LABEL[lang][session.type];
  const body =
    lang === "ru"
      ? `${label} начнётся через ${minutesBefore} мин.`
      : `${label} starts in ${minutesBefore} min.`;
  return `${emoji} <b>${weekend.name}</b>\n${body}\n📍 ${weekend.circuit}, ${weekend.city}`;
}

export function formatRaceResultsMessage(lang: NotificationLang, weekend: RaceWeekend, top3: RaceResultEntry[]): string {
  const podium = top3.map((entry, i) => `${i + 1}. ${entry.driver.fullName}`).join("\n");
  const title = lang === "ru" ? `результаты объявлены!` : `results are in!`;
  return `🏁 <b>${weekend.name}</b> — ${title}\n\n${podium}`;
}

function isClassified(entry: RaceResultEntry): boolean {
  return entry.status === "Finished" || entry.status.startsWith("+");
}

function formatDriverResultLine(lang: NotificationLang, entry: RaceResultEntry): string {
  if (isClassified(entry)) {
    return lang === "ru"
      ? `${entry.driver.fullName}: P${entry.position} (+${entry.points} очк.)`
      : `${entry.driver.fullName}: P${entry.position} (+${entry.points} pts)`;
  }
  return lang === "ru" ? `${entry.driver.fullName}: сход (${entry.status})` : `${entry.driver.fullName}: DNF (${entry.status})`;
}

/**
 * Одна строка на фаворита-пилота (formatDriverResultLine) плюс, если
 * выбрана любимая команда, отдельная строка на каждого из ЕЁ двух
 * пилотов той же гонки — раньше про favorite_constructor_id (команду) в
 * уведомлениях не было вообще ни строчки, хотя Personalization.tsx явно
 * позволяет выбрать её отдельно от пилотов (см. user_preferences,
 * favorite_driver_2_id тоже игнорировался — учитывался только первый
 * выбранный пилот). Обнаружено 17.09.2026, поймано не аудитом, а прямым
 * замечанием пользователя.
 */
export function formatFavoritesMessage(lang: NotificationLang, weekend: RaceWeekend, lines: string[]): string {
  const title = lang === "ru" ? `Ваши фавориты на этапе ${weekend.name}` : `Your favorites at ${weekend.name}`;
  return `🏎️ <b>${title}</b>\n\n${lines.join("\n")}`;
}

export { formatDriverResultLine };

export function formatChampionshipLeaderMessage(lang: NotificationLang, weekend: RaceWeekend, leader: Standing): string {
  const name = leader.driver?.fullName ?? "";
  return lang === "ru"
    ? `👑 Новый лидер чемпионата: <b>${name}</b> (${leader.points} очк.) после этапа ${weekend.name}.`
    : `👑 New championship leader: <b>${name}</b> (${leader.points} pts) after ${weekend.name}.`;
}
