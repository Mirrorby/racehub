/**
 * Ergast/Jolpica не отдаёт фирменные цвета команд. Держим их отдельно —
 * используются для акцентов в UI (полоска у имени пилота/команды, тема).
 *
 * Сезон 2026, constructorId проверены вручную через
 * https://api.jolpi.ca/ergast/f1/2026/constructors (08.09.2026):
 * alpine, aston_martin, audi, cadillac, ferrari, haas, mclaren, mercedes,
 * rb, red_bull, williams. Sauber выбыл (стал заводской командой Audi).
 *
 * Значения сэмплированы напрямую с фото ливрей 2026 года (не с логотипов —
 * большинство логотипов монохромны и дают неверный цвет при автоматическом
 * извлечении, см. аудит редизайна от 08.09.2026).
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
  rb: "#153E95",
  red_bull: "#1C2C7B",
  williams: "#1835D7",
};

const FALLBACK_COLOR = "#8E8E93";

export function constructorColor(constructorId: string): string {
  return CONSTRUCTOR_COLORS[constructorId] ?? FALLBACK_COLOR;
}
