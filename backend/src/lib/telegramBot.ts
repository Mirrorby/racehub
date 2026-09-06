import type { Env } from "../env";

/**
 * Отправка сообщений через Telegram Bot API. Никакой библиотеки —
 * нужен буквально один метод (sendMessage), тянуть SDK ради этого
 * избыточно.
 */
export async function sendTelegramMessage(env: Env, chatId: number, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    // Частая причина 403: пользователь заблокировал бота — это не баг
    // нашего кода, логируем и просто не шлём этому пользователю дальше
    // (следующий cron tick сам не будет ретраить именно это уведомление
    // благодаря notification_log, так что застревания в цикле ошибок нет).
    console.error(`Telegram sendMessage failed for chat ${chatId}: ${response.status} ${body}`);
  }
}
