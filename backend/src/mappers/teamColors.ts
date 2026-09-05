/**
 * Ergast/Jolpica не отдаёт фирменные цвета команд. Держим их отдельно —
 * используются для акцентов в UI (полоска у имени пилота/команды).
 * При смене ливреи/названия команды между сезонами просто обновить запись;
 * `constructorId` у Ergast обычно стабилен даже при ребрендинге (например
 * "alpine" пережил переименование из "renault").
 */
const CONSTRUCTOR_COLORS: Record<string, string> = {
  red_bull: "#3671C6",
  ferrari: "#E8002D",
  mercedes: "#27F4D2",
  mclaren: "#FF8000",
  aston_martin: "#00665F",
  alpine: "#00A1E8",
  williams: "#1868DB",
  rb: "#6692FF",
  sauber: "#00E701",
  haas: "#B6BABD",
};

const FALLBACK_COLOR = "#8E8E93";

export function constructorColor(constructorId: string): string {
  return CONSTRUCTOR_COLORS[constructorId] ?? FALLBACK_COLOR;
}
