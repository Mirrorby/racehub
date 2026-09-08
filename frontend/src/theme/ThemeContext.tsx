import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const DEFAULT_ACCENT = "#ff3040";

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return { r: 255, g: 48, b: 64 };
  return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) };
}

function applyTokens(accent: string) {
  const { r, g, b } = hexToRgb(accent);
  const root = document.documentElement;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-rgb", `${r}, ${g}, ${b}`);
  // Фон затемняем очень сильно (7-12% яркости) вне зависимости от того, какой
  // именно акцент пришёл — так белый текст поверх него всегда держит
  // контраст без отдельного WCAG-расчёта (тёмный УИ прощает почти любой
  // акцент). Формальный расчёт контраста не делаем: он оправдан только если
  // на нём меняются токены текста, а текст ниже намеренно остаётся
  // фиксированным светлым.
  root.style.setProperty("--app-bg", `rgb(${Math.round(r * .07)}, ${Math.round(g * .07)}, ${Math.round(b * .07)})`);
  root.style.setProperty("--app-bg-secondary", `rgb(${Math.round(r * .12 + 7)}, ${Math.round(g * .12 + 7)}, ${Math.round(b * .12 + 7)})`);
  // Карточки/бордер/nav тонируются в акцент, а не остаются нейтрально-белыми
  // поверх любой темы (см. ТЗ редизайна 4.3 — "не должны выглядеть
  // одинаково белыми поверх любого фона").
  root.style.setProperty("--surface-glass", `rgba(${r}, ${g}, ${b}, .09)`);
  root.style.setProperty("--surface-glass-strong", `rgba(${r}, ${g}, ${b}, .16)`);
  root.style.setProperty("--surface-border", `rgba(${r}, ${g}, ${b}, .28)`);
  root.style.setProperty("--nav-bg", `rgba(${Math.round(r * .15 + 14)}, ${Math.round(g * .15 + 14)}, ${Math.round(b * .15 + 14)}, .82)`);
}

const ThemeContext = createContext({ accent: DEFAULT_ACCENT, previewTheme: (_color?: string) => {}, restoreTheme: () => {} });

export function ThemeProvider({ savedAccent, children }: { savedAccent?: string; children: ReactNode }) {
  const baseline = savedAccent || DEFAULT_ACCENT;
  const [accent, setAccent] = useState(baseline);
  useEffect(() => { setAccent(baseline); applyTokens(baseline); }, [baseline]);
  const value = useMemo(() => ({ accent, previewTheme: (color?: string) => { const next = color || DEFAULT_ACCENT; setAccent(next); applyTokens(next); }, restoreTheme: () => { setAccent(baseline); applyTokens(baseline); } }), [accent, baseline]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() { return useContext(ThemeContext); }
export { DEFAULT_ACCENT };
