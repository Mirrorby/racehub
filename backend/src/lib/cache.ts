import type { Env } from "../env";
import { errorReason } from "./errors";
/**
 * Простой TTL-кэш поверх таблицы `api_cache` в D1 (см. backend/src/db/schema.sql).
 *
 * Что есть:
 * - get/set с TTL и отдачей протухших данных, если апстрим (Jolpica) недоступен
 *   (stale-if-error) — лучше показать вчерашние данные, чем ошибку в Mini App.
 *
 * Чего сознательно нет (TODO на будущее):
 * - Полноценный single-flight между параллельными запросами. Cloudflare
 *   Workers исполняются в изолированных изолятах без общей памяти между
 *   инстансами, так что дедупликация "N параллельных запросов = 1 вызов
 *   апстрима" потребовала бы Durable Object как единой точки координации.
 *   Пока не критично: TTL достаточно большой (см. вызовы ниже), а сам
 *   Jolpica отдаёт 429 с Retry-After, который провайдер уже уважает.
 */

interface CacheRow {
  payload: string;
  expires_at: string;
}

export async function getOrRefresh<T>(
  env: Env,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const now = new Date();

  const row = await env.DB.prepare("SELECT payload, expires_at FROM api_cache WHERE cache_key = ?")
    .bind(key)
    .first<CacheRow>();

  if (row && new Date(row.expires_at) > now) {
    return JSON.parse(row.payload) as T;
  }

  try {
    const fresh = await fetcher();
    const nowIso = now.toISOString();
    const expiresIso = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    await env.DB.prepare(
      `INSERT INTO api_cache (cache_key, payload, fetched_at, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`,
    )
      .bind(key, JSON.stringify(fresh), nowIso, expiresIso)
      .run();
    return fresh;
  } catch (err) {
    // Апстрим недоступен/перегружен — отдаём протухший кэш, если он есть,
    // вместо того чтобы ронять весь ответ пользователю. Раньше лог всегда
    // писал "Jolpica fetch failed" независимо от реального источника (этот
    // же кэш используется и для openf1:* ключей) и не печатал текст самой
    // ошибки (err.message) — в Cloudflare Logs было видно только стек,
    // без кода ответа/причины. Теперь источник виден из самого ключа,
    // а сообщение — явным полем в строке лога.
    const reason = errorReason(err);
    if (row) {
      console.error(`getOrRefresh: upstream fetch failed for "${key}" (${reason}), serving stale cache`);
      return JSON.parse(row.payload) as T;
    }
    console.error(`getOrRefresh: upstream fetch failed for "${key}" (${reason}), no cache to fall back on`);
    throw err;
  }
}
