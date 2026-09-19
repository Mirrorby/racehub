import type { Env } from "../env";
import { errorReason } from "../lib/errors";
import { isStale, markSynced } from "./appState";

const CLEANUP_KEY = "cleanup";
// Раз в сутки более чем достаточно — обе таблицы растут медленно
// относительно масштаба проекта, ежедневная чистка не даёт им скопиться
// заметно, и не стоит тратить на неё бюджет каждого 15-минутного тика.
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// notification_log нужен только для идемпотентности в пределах одного
// гоночного уик-энда (не слать одно и то же уведомление дважды) — хранить
// его дольше пары недель смысла нет, а таблица растёт с каждой отправкой
// каждому пользователю на каждое событие.
const NOTIFICATION_LOG_RETENTION_DAYS = 30;

/**
 * sessions/notification_log растут без ограничения при обычной работе
 * приложения — ни то, ни другое раньше не чистилось вообще. По факту в
 * проде на 17.09.2026: 139 строк sessions на 3 пользователей (токен не
 * персистится на фронте до этого фикса — см. api/client.ts, каждый
 * перезапуск Mini App создавал новую сессию). Обнаружено при аудите.
 */
export async function runCleanup(env: Env): Promise<void> {
  if (!(await isStale(env, CLEANUP_KEY, CLEANUP_INTERVAL_MS))) return;

  try {
    const sessionsResult = await env.DB.prepare("DELETE FROM sessions WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").run();
    const logResult = await env.DB.prepare(
      `DELETE FROM notification_log WHERE sent_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`,
    )
      .bind(`-${NOTIFICATION_LOG_RETENTION_DAYS} days`)
      .run();
    console.log(
      `runCleanup: removed ${sessionsResult.meta.changes} expired sessions, ${logResult.meta.changes} old notification_log rows`,
    );
    await markSynced(env, CLEANUP_KEY);
  } catch (err) {
    console.error(`runCleanup: failed (${errorReason(err)})`);
  }
}
