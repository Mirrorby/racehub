import type { Env } from "../env";
import { InitDataValidationError, validateTelegramInitData } from "../lib/telegramAuth";
import { findOrCreateUser } from "../lib/userRepository";
import { createSession } from "../lib/sessionRepository";
import { jsonResponse } from "../lib/http";

export async function handleTelegramAuth(request: Request, env: Env): Promise<Response> {
  let body: { initData?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!body.initData) {
    return jsonResponse({ error: "initData is required" }, 400);
  }

  try {
    const { user } = await validateTelegramInitData(body.initData, env.TELEGRAM_BOT_TOKEN, {
      // В dev допускаем более старые тестовые initData, чтобы не мешать локальной разработке.
      enforceFreshness: env.ENVIRONMENT === "production",
    });

    const { userId, isNewUser } = await findOrCreateUser(env, user);
    const sessionToken = await createSession(env, userId);

    return jsonResponse({ sessionToken, isNewUser });
  } catch (err) {
    if (err instanceof InitDataValidationError) {
      return jsonResponse({ error: `Invalid Telegram initData: ${err.message}` }, 401);
    }
    throw err;
  }
}
