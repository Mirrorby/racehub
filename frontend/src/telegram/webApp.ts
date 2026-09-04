import WebApp from "@twa-dev/sdk";

/**
 * Тонкая обёртка над @twa-dev/sdk. Держим весь прямой доступ к
 * window.Telegram.WebApp в одном модуле, чтобы остальной код не зависел
 * от глобального объекта напрямую (легче тестировать/мокать).
 */
export const telegram = WebApp;

export function isRunningInTelegram(): boolean {
  // initData пустой, если открыто вне Telegram (обычный браузер при разработке)
  return Boolean(telegram.initData && telegram.initData.length > 0);
}

export function getRawInitData(): string {
  return telegram.initData ?? "";
}
