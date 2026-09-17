import type { Env } from "../env";
import { deliverNotification } from "../lib/telegramBot";
import { getMostRecentStartedRace } from "../services/calendarService";
import { getRaceDetail } from "../services/raceDetailService";
import type { RaceResultEntry, RaceWeekend, Standing } from "../types";

const CHAMPIONSHIP_LEADER_STATE_KEY = "championship_leader_driver_id";

interface NotifiableUser {
  id: string;
  telegram_user_id: number;
}

interface DriverFanUser extends NotifiableUser {
  favorite_driver_id: string;
}

interface StandingsRow {
  data_json: string;
}

/** true, если уже отправляли (есть запись в notification_log под этим ключом). */
async function wasAlreadySent(env: Env, userId: string, key: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT 1 FROM notification_log WHERE user_id = ? AND notification_key = ?")
    .bind(userId, key)
    .first();
  return Boolean(row);
}

async function claimNotification(env: Env, userId: string, key: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO notification_log (id, user_id, notification_key) VALUES (?, ?, ?)
     ON CONFLICT (user_id, notification_key) DO NOTHING`,
  )
    .bind(crypto.randomUUID(), userId, key)
    .run();
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
    // Claim — только после подтверждённой отправки (см.
    // lib/telegramBot.ts::deliverNotification). Раньше было наоборот:
    // claim до отправки означал безвозвратную потерю уведомления при
    // любом транзиентном сбое Telegram API. Обнаружено 16.09.2026.
    if (await wasAlreadySent(env, user.id, key)) continue;
    const delivered = await deliverNotification(env, user.id, user.telegram_user_id, message);
    if (delivered) await claimNotification(env, user.id, key);
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
    if (await wasAlreadySent(env, user.id, key)) continue;

    const text = isClassified(entry)
      ? `🏎️ ${entry.driver.fullName} finished <b>P${entry.position}</b> at ${weekend.name} (+${entry.points} pts).`
      : `🏎️ ${entry.driver.fullName} didn't finish ${weekend.name}: ${entry.status}.`;
    const delivered = await deliverNotification(env, user.id, user.telegram_user_id, text);
    if (delivered) await claimNotification(env, user.id, key);
  }
}

/**
 * Раньше здесь был собственный живой запрос к OpenF1/Jolpica (fast-path +
 * фолбэк), независимый от cron/syncCalendarAndStandings.ts — та же логика,
 * продублированная в другом файле, со своим кэшем в api_cache. Проблема
 * не только в дублировании: этот файл вызывается по своему 5-минутному
 * триггеру, а наполнение D1 — по своему 15-минутному, и эти два
 * расписания совпадают каждые 15 минут (0,15,30,45) — то есть раз в 15
 * минут два независимых инвока воркера потенциально били в Jolpica/OpenF1
 * одновременно, ни один из них не зная о SubrequestBudget другого. Теперь
 * здесь просто читаем то, что cron уже посчитал — обновление раз в 15
 * минут (в гоночный уик-энд) более чем достаточно для проверки "не
 * сменился ли лидер". Обнаружено и исправлено 16.09.2026 при аудите.
 */
async function resolveChampionshipLeader(env: Env): Promise<Standing | undefined> {
  const row = await env.DB.prepare(
    "SELECT data_json FROM standings_cache WHERE type = 'drivers' ORDER BY updated_at DESC LIMIT 1",
  ).first<StandingsRow>();
  if (!row) return undefined;
  const standings = JSON.parse(row.data_json) as Standing[];
  return standings[0];
}

async function notifyChampionshipLeaderChange(env: Env, weekend: RaceWeekend): Promise<void> {
  const leader = await resolveChampionshipLeader(env);
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
    if (await wasAlreadySent(env, user.id, key)) continue;
    const delivered = await deliverNotification(env, user.id, user.telegram_user_id, message);
    if (delivered) await claimNotification(env, user.id, key);
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
