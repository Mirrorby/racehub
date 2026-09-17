import type { Env } from "../env";

export type SendResult = "sent" | "blocked" | "failed";

/**
 * Отправка сообщений через Telegram Bot API. Никакой библиотеки —
 * нужен буквально один метод (sendMessage), тянуть SDK ради этого
 * избыточно.
 *
 * Возвращает один из трёх исходов, не бросает исключение на HTTP-ошибке:
 * - "sent" — claim'им notification_log как обычно.
 * - "blocked" (403, пользователь заблокировал бота) — это ПОСТОЯННАЯ
 *   ошибка, не транзиентная. Раньше её не отличали от сетевого сбоя, и в
 *   версии с "claim до отправки" это было ещё не так страшно (хоть раз
 *   попробовали — и хватит), но при переходе на "claim после отправки"
 *   (см. notifications/*.ts) НЕ claim'ить "blocked" означало бы пытаться
 *   слать одному и тому же мёртвому чату на каждом тике вечно. Поэтому
 *   вызывающая сторона на "blocked" обязана сама отключить
 *   notification_settings.enabled для этого пользователя — не просто
 *   промолчать.
 * - "failed" (сетевая ошибка/5xx/иной транзиентный сбой) — НЕ claim'им,
 *   пусть повторится на следующем тике. Раньше claim происходил до
 *   отправки в принципе, поэтому такой сбой означал безвозвратную потерю
 *   уведомления. Обнаружено 16.09.2026 при аудите.
 */
export async function sendTelegramMessage(env: Env, chatId: number, text: string): Promise<SendResult> {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    console.error(`Telegram sendMessage network error for chat ${chatId}: ${err instanceof Error ? err.message : String(err)}`);
    return "failed";
  }

  if (response.status === 403) {
    console.error(`Telegram sendMessage: chat ${chatId} blocked the bot, disabling notifications for them`);
    return "blocked";
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`Telegram sendMessage failed for chat ${chatId}: ${response.status} ${body}`);
    return "failed";
  }

  return "sent";
}

/**
 * Общая точка для notifications/*.ts: отправляет и решает, claim'ить ли
 * notification_log — централизованно, чтобы обе точки входа (напоминания
 * о сессиях и уведомления о результатах) не дублировали одну и ту же
 * логику "заблокировал бота -> выключить настройки" по отдельности.
 * Возвращает true, если нужно claim'ить (успешная отправка), false —
 * если нет (транзиентный сбой ИЛИ пользователь заблокировал бота — в
 * обоих случаях claim не нужен, но по разным причинам, см. SendResult).
 */
export async function deliverNotification(env: Env, userId: string, chatId: number, text: string): Promise<boolean> {
  const result = await sendTelegramMessage(env, chatId, text);
  if (result === "sent") return true;

  if (result === "blocked") {
    await env.DB.prepare("UPDATE notification_settings SET enabled = 0 WHERE user_id = ?").bind(userId).run();
  }
  return false;
}
