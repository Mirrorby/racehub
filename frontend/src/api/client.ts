import { isRunningInTelegram, getRawInitData } from "../telegram/webApp";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

// Раньше sessionToken жил только в памяти модуля — на каждый перезапуск
// Telegram Mini App (сворачивание/разворачивание, убитый WebView) фронт
// заново дёргал /auth/telegram и backend заводил НОВУЮ строку в sessions,
// даже если предыдущая ещё была валидна (TTL 30 дней, см.
// lib/sessionRepository.ts). По факту в проде на 17.09.2026: 139 строк
// sessions на 3 пользователей. Обнаружено при аудите.
const STORAGE_KEY = "rh_session_token";

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // приватный режим/запрещённый доступ к localStorage — не критично,
    // просто ведём себя как раньше (токен только в памяти)
    return null;
  }
}

let sessionToken: string | null = readStoredToken();

export function getSessionToken(): string | null {
  return sessionToken;
}

export function setSessionToken(token: string | null): void {
  sessionToken = token;
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // см. readStoredToken — не критично для работы приложения
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface AuthResponse {
  sessionToken: string;
}

/**
 * Не импортирует api/auth.ts (там authenticateWithTelegram зовёт этот же
 * apiFetch — получился бы циклический импорт), поэтому запрос к
 * /auth/telegram продублирован здесь как есть, коротко.
 */
async function reauthenticate(): Promise<string | null> {
  if (!isRunningInTelegram()) return null;
  try {
    const response = await fetch(`${API_BASE_URL}/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: getRawInitData() }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as AuthResponse;
    setSessionToken(data.sessionToken);
    return data.sessionToken;
  } catch {
    return null;
  }
}

/**
 * Единая точка HTTP-запросов к backend. Никаких прямых обращений к
 * Jolpica/OpenF1 с фронтенда — это запрещено ТЗ (раздел 5.1: "запросы
 * только через backend").
 *
 * На 401 (токен просрочен на бэкенде/удалён чисткой — см.
 * cron/cleanup.ts) пробует перелогиниться через Telegram initData ОДИН
 * раз и повторить запрос — не заставляет пользователя перезапускать
 * приложение вручную только потому, что 30-дневный токен истёк.
 */
export async function apiFetch<T>(path: string, init?: RequestInit, isRetry = false): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (sessionToken) {
    headers.set("Authorization", `Bearer ${sessionToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (response.status === 401 && !isRetry) {
    const newToken = await reauthenticate();
    if (newToken) return apiFetch<T>(path, init, true);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ApiError(body || response.statusText, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
