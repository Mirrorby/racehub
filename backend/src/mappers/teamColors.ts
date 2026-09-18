/**
 * Ergast/Jolpica не отдаёт фирменные цвета команд. Держим их отдельно —
 * используются для акцентов в UI (полоска у имени пилота/команды, тема).
 *
 * constructorId ниже — "red_bull"/"rb". Это ПРАВИЛЬНАЯ, доминирующая
 * конвенция: подтверждена по /current/{round}/results.json,
 * /current/{round}/qualifying.json и /current/driverStandings.json —
 * ВЕЗДЕ, где реально текут гоночные данные. Ложная тревога 13.09.2026
 * (правка в сторону "red_bull_racing"/"racing_bulls") основывалась
 * только на одном эндпоинте — /current/constructorStandings.json,
 * который аномально использует другой id (и другое ИМЯ: "Red Bull"
 * против "Red Bull Racing", "RB F1 Team" против "Racing Bulls") для тех
 * же двух команд. Откат и разбор — 17.09.2026 при аудите. Единственное
 * место, которому эта аномалия реально касается — mapConstructorStandings
 * (mappers/standings.ts), там теперь есть точечный alias именно под
 * этот один эндпоинт; везде остальным (включая эту таблицу) канон —
 * "red_bull"/"rb".
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
