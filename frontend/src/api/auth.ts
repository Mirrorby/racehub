import { apiFetch } from "./client";
import type { BootstrapResponse } from "../types/domain";

export interface AuthResponse {
  sessionToken: string;
  isNewUser: boolean;
}

/**
 * Обмен сырого Telegram.WebApp.initData на серверную сессию.
 * Backend валидирует подпись/auth_date (ТЗ раздел 10) — фронт никогда
 * не доверяет initDataUnsafe самостоятельно.
 */
export async function authenticateWithTelegram(initData: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/telegram", {
    method: "POST",
    body: JSON.stringify({ initData }),
  });
}

export async function fetchBootstrap(): Promise<BootstrapResponse> {
  return apiFetch<BootstrapResponse>("/bootstrap");
}
