/**
 * Цвета команд сезона 2026. Значения сэмплированы напрямую с реальных фото
 * ливрей (не с логотипов — большинство логотипов монохромны и не годятся
 * для автоматического извлечения "фирменного" цвета, см. аудит редизайна).
 *
 * constructorId соответствует значениям Jolpica/Ergast API, проверено вручную
 * через https://api.jolpi.ca/ergast/f1/2026/constructors (08.09.2026).
 *
 *Cadillac — ливрея чёрно-графитовая без выраженного насыщенного акцента,
 * поэтому цвет подобран вручную (графитовый), а не извлечён автоматически.
 */
const TEAM_COLORS: Record<string, string> = {
  alpine: "#2875B4",
  aston_martin: "#1A644F",
  audi: "#BA2221",
  cadillac: "#9CA3AC",
  ferrari: "#B21E23",
  haas: "#CF1E21",
  mclaren: "#E27F31",
  mercedes: "#2D9790",
  rb: "#153E95",
  red_bull: "#1C2C7B",
  williams: "#1835D7",
};

const FALLBACK_COLOR = "#ff3040";

export function teamColor(id?: string, color?: string): string {
  return color || TEAM_COLORS[id ?? ""] || FALLBACK_COLOR;
}
