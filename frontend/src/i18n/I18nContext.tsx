mport { createContext, useContext, useMemo, type ReactNode } from "react";

export type Language = "en" | "ru";

const messages = {
  en: { home: "Home", calendar: "Calendar", championship: "Championship", more: "More", nextWeekend: "Next weekend", weekend: "Weekend", yourDrivers: "Your drivers", yourTeam: "Your team", choose: "Choose", results: "Results", live: "Live", upcoming: "Upcoming", finished: "Finished", current: "Current", drivers: "Drivers", constructors: "Constructors", showAll: "Show all", showLess: "Show less", trackStatistics: "Track statistics", schedule: "Schedule", personalization: "Personalization", language: "Language", notifications: "Notifications", preferences: "Preferences", save: "Save", saved: "Saved", defaultTheme: "Default F1", selectDrivers: "Select up to two drivers", selectTeam: "Select a team", defaultThemeDesc: "Black · white · red", currentSelection: "Current selection", season: "Current season", career: "Career", generalInfo: "General information", dataUnavailable: "Data is temporarily unavailable.", noData: "No data available yet.", round: "Round", points: "PTS", wins: "Wins", position: "Position", laps: "Laps", team: "Team", historicalRecords: "Historical records", driverCode: "Driver code", number: "Number", trackCredit: "Circuit outlines: f1-circuits-svg by Jules Roy, CC BY 4.0", podiums: "Podiums", poles: "Poles", championships: "Championships", careerSpan: "Active", mostWinsHere: "Most wins here", lapRecord: "Lap record", firstHeld: "First held", totalRaces: "Races held", winsStatsUnavailable: "Not available for tracks with a long history yet.", about: "About", disclaimer: "Podium Pulse is an unofficial, fan-made motorsport companion. It is not associated with or endorsed by Formula 1, the FIA, teams, or drivers. All trademarks belong to their owners. Data may be delayed or incomplete.", locale: "en-US" },
  ru: { home: "Главная", calendar: "Календарь", championship: "Чемпионат", more: "Ещё", nextWeekend: "Следующий уикенд", weekend: "Уикенд", yourDrivers: "Ваши пилоты", yourTeam: "Ваша команда", choose: "Выбрать", results: "Результаты", live: "В эфире", upcoming: "Ожидается", finished: "Завершён", current: "Текущий", drivers: "Пилоты", constructors: "Команды", showAll: "Показать все", showLess: "Свернуть", trackStatistics: "Статистика трассы", schedule: "Расписание", personalization: "Персонализация", language: "Язык", notifications: "Уведомления", preferences: "Настройки", save: "Сохранить", saved: "Сохранено", defaultTheme: "Default F1", selectDrivers: "Выберите до двух пилотов", selectTeam: "Выберите команду", defaultThemeDesc: "Чёрный · белый · красный", currentSelection: "Текущий выбор", season: "Текущий сезон", career: "Карьера", generalInfo: "Общая информация", dataUnavailable: "Данные временно недоступны.", noData: "Данные пока недоступны.", round: "Этап", points: "ОЧК", wins: "Победы", position: "Позиция", laps: "Круги", team: "Команда", historicalRecords: "Исторические рекорды", driverCode: "Код пилота", number: "Номер", trackCredit: "Контуры трасс: f1-circuits-svg (Jules Roy), CC BY 4.0", podiums: "Подиумы", poles: "Поулы", championships: "Титулы", careerSpan: "Активен", mostWinsHere: "Больше всех побед здесь", lapRecord: "Рекорд круга", firstHeld: "Первый этап", totalRaces: "Проведено гонок", winsStatsUnavailable: "Пока недоступно для трасс с долгой историей.", about: "О проекте", disclaimer: "Podium Pulse — неофициальное фан-приложение о автоспорте. Не связано с Formula 1, FIA, командами или пилотами и не одобрено ими. Все товарные знаки принадлежат их владельцам. Данные могут приходить с задержкой или быть неполными.", locale: "ru-RU" },
} as const;

type MessageKey = keyof typeof messages.en;
const I18nContext = createContext({ language: "en" as Language, t: (key: MessageKey) => messages.en[key] as string });

export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  const value = useMemo(() => ({ language, t: (key: MessageKey) => messages[language][key] as string }), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() { return useContext(I18nContext); }

export function formatLocalDate(iso: string, locale: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat(locale, options).format(new Date(iso));
}
