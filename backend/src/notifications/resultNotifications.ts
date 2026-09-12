import type { Env } from "../env";
import { getOrRefresh } from "../lib/cache";
import { errorReason } from "../lib/errors";
import { sendTelegramMessage } from "../lib/telegramBot";
import { getDriverStandings } from "../providers/jolpica";
import { mapDriverStandings } from "../mappers/standings";
import { getFastDriverStandings } from "../services/liveResultsService";
import { getMostRecentStartedRace } from "../services/calendarService";
import { getRaceDetail } from "../services/raceDetailService";
import type { RaceResultEntry, RaceWeekend, Standing } from "../types";

// Тот же ключ и TTL, что использует GET /api/standings/drivers — если
// standings уже свежие в кэше (кто-то недавно открыл Standings-страницу),
// повторного похода в Jolpica не будет.
const STANDINGS_CACHE_KEY = "standings:drivers";
const STANDINGS_TTL_SECONDS = 15 * 60;
const CHAMPIONSHIP_LEADER_STATE_KEY = "championship_leader_driver_id";

interface NotifiableUser {
  id: string;
  telegram_user_id: number;
}

interface DriverFanUser extends NotifiableUser {
  favorite_driver_id: string;
}

/** INSERT OR IGNORE в notification_log; true, если запись реально новая (можно слать). */
async function claimNotification(env: Env, userId: string, key: string): Promise<boolean> {
  const result = await env.DB.prepare(
    `INSERT INTO notification_log (id, user_id, notification_key) VALUES (?, ?, ?)
     ON CONFLICT (user_id, notification_key) DO NOTHING`,
  )
    .bind(crypto.randomUUID(), userId, key)
    .run();
  return result.meta.changes > 0;
}

function isClassified(entry: RaceResultEntry): boolean {
  return entry.status === "Finished" || entry.status.startsWith("+");
}

async function notifyRaceResults(env: Env, weekend: RaceWeekend, results: RaceResultEntry[]): Promise<void> {
  const users = await env.DB.prepare(
    `SELECT u.id AS id, u.telegram_user_id AS telegram_user_id
     FROM users u
     JOIN notification_settings ns ON ns.user_id = u.id
     WHERE ns.enabled = 1 AND ns.results_enabled = 1`,
  ).all<NotifiableUser>();

  if (!users.results || users.results.length === 0) return;

  const podium = results
    .slice(0, 3)
    .map((entry, i) => `${i + 1}. ${entry.driver.fullName}`)
    .join("\n");
  const message = `🏁 <b>${weekend.name}</b> — results are in!\n\n${podium}`;
  const key = `results:${weekend.id}:race`;

  for (const user of users.results) {
    if (await claimNotification(env, user.id, key)) {
      await sendTelegramMessage(env, user.telegram_user_id, message);
    }
  }
}

async function notifyFavoriteDriverResult(env: Env, weekend: RaceWeekend, results: RaceResultEntry[]): Promise<void> {
  const users = await env.DB.prepare(
    `SELECT u.id AS id, u.telegram_user_id AS telegram_user_id, up.favorite_driver_id AS favorite_driver_id
     FROM users u
     JOIN notification_settings ns ON ns.user_id = u.id
     JOIN user_preferences up ON up.user_id = u.id
     WHERE ns.enabled = 1 AND ns.favorite_driver_result_enabled = 1 AND up.favorite_driver_id IS NOT NULL`,
  ).all<DriverFanUser>();

  if (!users.results || users.results.length === 0) return;

  const key = `results:${weekend.id}:favoriteDriver`;

  for (const user of users.results) {
    const entry = results.find((r) => r.driver.id === user.favorite_driver_id);
    if (!entry) continue; // не участвовал в этой гонке (замена, отсутствие и т.п.)

    if (!(await claimNotification(env, user.id, key))) continue;

    const text = isClassified(entry)
      ? `🏎️ ${entry.driver.fullName} finished <b>P${entry.position}</b> at ${weekend.name} (+${entry.points} pts).`
      : `🏎️ ${entry.driver.fullName} didn't finish ${weekend.name}: ${entry.status}.`;
    await sendTelegramMessage(env, user.telegram_user_id, text);
  }
}

async function resolveChampionshipLeader(env: Env, weekend: RaceWeekend): Promise<Standing | undefined> {
  const fast = await getFastDriverStandings(env, weekend).catch((err) => {
    console.error(`OpenF1 fast-path standings failed for leader check (${errorReason(err)}), falling back to Jolpica`);
    return null;
  });
  if (fast) return fast[0];

  const { standings } = await getOrRefresh(env, STANDINGS_CACHE_KEY, STANDINGS_TTL_SECONDS, getDriverStandings);
  return mapDriverStandings(standings)[0];
}

async function notifyChampionshipLeaderChange(env: Env, weekend: RaceWeekend): Promise<void> {
  const leader = await resolveChampionshipLeader(env, weekend);
  if (!leader?.driver) return;

  const stored = await env.DB.prepare("SELECT value FROM app_state WHERE key = ?")
    .bind(CHAMPIONSHIP_LEADER_STATE_KEY)
    .first<{ value: string }>();
  const previousLeaderId = stored?.value ?? null;

  if (previousLeaderId === leader.driver.id) return; // без изменений с прошлой проверки

  // Обновляем состояние сразу, до рассылки — если рассылка ниже частично
  // упадёт (например Telegram недоступен), на следующем тике мы не должны
  // повторно решить, что "лидер изменился".
  await env.DB.prepare(
    `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
    .bind(CHAMPIONSHIP_LEADER_STATE_KEY, leader.driver.id)
    .run();

  // Самый первый запуск (previousLeaderId === null) — не с чем сравнивать,
  // не спамим всех "новостью" о лидере, который лидировал с начала сезона.
  if (previousLeaderId === null) return;

  const users = await env.DB.prepare(
    `SELECT u.id AS id, u.telegram_user_id AS telegram_user_id
     FROM users u
     JOIN notification_settings ns ON ns.user_id = u.id
     WHERE ns.enabled = 1 AND ns.championship_change_enabled = 1`,
  ).all<NotifiableUser>();

  if (!users.results || users.results.length === 0) return;

  const message = `👑 New championship leader: <b>${leader.driver.fullName}</b> (${leader.points} pts) after ${weekend.name}.`;
  const key = `leader-change:${weekend.id}`;

  for (const user of users.results) {
    if (await claimNotification(env, user.id, key)) {
      await sendTelegramMessage(env, user.telegram_user_id, message);
    }
  }
}

/**
 * Точка входа для scheduled-триггера. В отличие от sessionReminders
 * (событие точно предсказуемо по времени), здесь событие — "результаты
 * стали доступны у апстрима", момент публикации которых мы не знаем
 * заранее, поэтому просто проверяем на каждом тике cron, появились ли
 * результаты ближайшей уже начавшейся гонки, и полагаемся на
 * notification_log для идемпотентности.
 */
export async function runResultNotifications(env: Env): Promise<void> {
  const weekend = await getMostRecentStartedRace(env);
  if (!weekend) return;

  const detail = await getRaceDetail(env, weekend.id);
  if (!detail?.raceResults) return; // ещё не опубликованы апстримом

  await notifyRaceResults(env, weekend, detail.raceResults);
  await notifyFavoriteDriverResult(env, weekend, detail.raceResults);
  await notifyChampionshipLeaderChange(env, weekend);
}
