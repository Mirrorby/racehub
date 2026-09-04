import { telegram } from "./webApp";

export type ThemeMode = "telegram" | "light" | "dark";

/**
 * ТЗ п.14: поддержка Telegram light/dark + собственный accent.
 * Режим "telegram" использует colorScheme Telegram (light/dark) как базу
 * для переменных из theme.css и не переопределяет наш accent color —
 * собственная айдентика должна остаться собственной даже в telegram-режиме.
 */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;

  if (mode === "telegram") {
    const scheme = telegram.colorScheme === "dark" ? "dark" : "light";
    root.setAttribute("data-rh-theme", scheme);
  } else {
    root.setAttribute("data-rh-theme", mode);
  }
}

export function subscribeToTelegramThemeChanges(mode: ThemeMode, onChange: () => void): () => void {
  if (mode !== "telegram") {
    return () => {};
  }
  const handler = () => {
    applyTheme(mode);
    onChange();
  };
  telegram.onEvent("themeChanged", handler);
  return () => telegram.offEvent("themeChanged", handler);
}
