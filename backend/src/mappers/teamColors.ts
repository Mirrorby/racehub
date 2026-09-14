/**
 * Ergast/Jolpica не отдаёт фирменные цвета команд. Держим их отдельно —
 * используются для акцентов в UI (полоска у имени пилота/команды, тема).
 *
 * ВНИМАНИЕ: constructorId "rb"/"red_bull" ниже — то, что раньше считалось
 * проверенным вручную (см. историю правок), на деле разошлось с тем, что
 * реально отдаёт живой /driverstandings и /constructorstandings в 2026
 * сезоне: там constructorId — "racing_bulls" и "red_bull_racing"
 * (подтверждено напрямую из прод-таблицы standings_cache 13.09.2026, не
 * из документации — Jolpica сама пишет, что её модель данных не совпадает
 * с legacy Ergast, и, похоже, именно эти два id и переименовали). Без
 * этой правки live-цвета из OpenF1 (team_colors) почти всегда есть, но
 * ДО того, как они посчитаются (холодный старт/начало сезона), фолбэк
 * ниже тихо отдавал бы серый FALLBACK_COLOR для этих двух команд.
 *
 * ВАЖНО: эта таблица дублируется во frontend/src/theme/teamColors.ts.
 * При обновлении ливрей/составов на будущий сезон нужно править ОБА файла —
 * технический долг, зафиксированный в аудите.
 */
const CONSTRUCTOR_COLORS: Record<string, string> = {
  alpine: "#2875B4",
  aston_martin: "#1A644F",
  audi: "#BA2221",
  cadillac: "#9CA3AC", // ливрея чёрно-графитовая, цвет подобран вручную
  ferrari: "#B21E23",
  haas: "#CF1E21",
  mclaren: "#E27F31",
  mercedes: "#2D9790",
  racing_bulls: "#153E95",
  red_bull_racing: "#1C2C7B",
  williams: "#1835D7",
};

const FALLBACK_COLOR = "#8E8E93";

export function constructorColor(constructorId: string): string {
  return CONSTRUCTOR_COLORS[constructorId] ?? FALLBACK_COLOR;
}
