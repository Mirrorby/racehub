/**
 * Цвета команд сезона 2026. Значения сэмплированы напрямую с реальных фото
 * ливрей (не с логотипов — большинство логотипов монохромны и не годятся
 * для автоматического извлечения "фирменного" цвета, см. аудит редизайна).
 *
 * constructorId ниже — "racing_bulls"/"red_bull_racing", а не "rb"/
 * "red_bull", как считалось раньше (см. одноимённый файл на бэкенде,
 * backend/src/mappers/teamColors.ts, — там подробное объяснение: реальный
 * /driverstandings и /constructorstandings в 2026 сезоне отдают именно
 * такие constructorId, расхождение обнаружено 13.09.2026 через прямой
 * запрос к прод-базе, а не по документации).
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
  racing_bulls: "#153E95",
  red_bull_racing: "#1C2C7B",
  williams: "#1835D7",
};

const FALLBACK_COLOR = "#ff3040";

export function teamColor(id?: string, color?: string): string {
  return color || TEAM_COLORS[id ?? ""] || FALLBACK_COLOR;
}
