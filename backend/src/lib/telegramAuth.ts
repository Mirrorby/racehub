/**
 * Валидация Telegram.WebApp.initData на backend.
 * Алгоритм из официальной документации Telegram:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * 1. secret_key = HMAC_SHA256(key="WebAppData", data=bot_token)
 * 2. data_check_string = все пары "key=value" (кроме hash), отсортированные
 *    по ключу и склеенные через "\n"
 * 3. hash сравнивается с HMAC_SHA256(key=secret_key, data=data_check_string)
 */

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface ValidatedInitData {
  user: TelegramUser;
  authDate: number; // unix seconds
}

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60; // 24 часа

async function hmacSha256(keyData: BufferSource, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}

function bufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class InitDataValidationError extends Error {}

export async function validateTelegramInitData(
  rawInitData: string,
  botToken: string,
  options: { enforceFreshness: boolean } = { enforceFreshness: true },
): Promise<ValidatedInitData> {
  if (!rawInitData) {
    throw new InitDataValidationError("Empty initData");
  }

  const params = new URLSearchParams(rawInitData);
  const hash = params.get("hash");
  if (!hash) {
    throw new InitDataValidationError("Missing hash");
  }
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken);
  const computedHash = bufferToHex(await hmacSha256(secretKey, dataCheckString));

  if (computedHash !== hash) {
    throw new InitDataValidationError("Signature mismatch");
  }

  const authDateRaw = params.get("auth_date");
  if (!authDateRaw) {
    throw new InitDataValidationError("Missing auth_date");
  }
  const authDate = Number(authDateRaw);

  if (options.enforceFreshness) {
    const ageSeconds = Date.now() / 1000 - authDate;
    if (ageSeconds > MAX_AUTH_AGE_SECONDS) {
      throw new InitDataValidationError("initData expired");
    }
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    throw new InitDataValidationError("Missing user");
  }

  let user: TelegramUser;
  try {
    user = JSON.parse(userRaw);
  } catch {
    throw new InitDataValidationError("Malformed user payload");
  }

  return { user, authDate };
}
