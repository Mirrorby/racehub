import type { Env } from "../env";
import { deliverNotification } from "../lib/telegramBot";
import { getMostRecentStartedRace } from "../services/calendarService";
import { getRaceDetail } from "../services/raceDetailService";
import { formatRaceResultsMessage, formatFavoritesMessage, formatDriverResultLine, formatChampionshipLeaderMessage, type NotificationLang } from "./messages";
import type { RaceResultEntry, RaceWeekend, Standing } from "../types";

const CHAMPIONSHIP_LEADER_STATE_KEY = "championship_leader_driver_id";

interface NotifiableUser {
  id: string;
  telegram_user_id: number;
  language: NotificationLang;
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

async function notifyRaceResults(env: Env, weekend: RaceWeekend, results: RaceResultEntry[]): Promise<void> {
  const users = await env.DB.prepare(
    `SELECT u.id AS id, u.telegram_user_id AS telegram_user_id, COALESCE(up.language, 'en') AS language
     FROM users u
     JOIN notification_settings ns ON ns.user_id = u.id
     LEFT JOIN user_preferences up ON up.user_id = u.id
     WHERE ns.enabled = 1 AND ns.results_enabled = 1`,
  ).all<NotifiableUser>();

  if (!users.results || users.results.length === 0) return;

  const top3 = results.slice(0, 3);
  const key = `results:${weekend.id}:race`;

  for (const user of users.results) {
    // Claim — только после подтверждённой отправки (см.
    // lib/telegramBot.ts::deliverNotification). Раньше было наоборот:
    // claim до отправки означал безвозвратную потерю уведомления при
    // любом транзиентном сбое Telegram API. Обнаружено 16.09.2026.
    if (await wasAlreadySent(env, user.id, key)) continue;
    const message = formatRaceResultsMessage(user.language, weekend, top3);
    const delivered = await deliverNotification(env, user.id, user.telegram_user_id, message);
    if (delivered) await claimNotification(env, user.id, key);
  }
}

interface FavoritesUser extends NotifiableUser {
  favorite_driver_id: string | null;
  favorite_driver_2_id: string | null;
  favorite_constructor_id: string | null;
}

/**
 * Покрывает ВСЕ виды "фаворитов", которые вообще можно выбрать в
 * Personalization.tsx: до двух любимых пилотов и любимую команду — все
 * три независимы друг от друга (не взаимоисключающий выбор), и раньше
 * учитывался только favorite_driver_id (первый пилот), а
 * favorite_driver_2_id и favorite_constructor_id в уведомлениях не
 * участвовали вообще. Одно сообщение на пользователя, а не три отдельных
 * пуша подряд — строки собираются под общий заголовок.
 */
async function notifyFavorites(env: Env, weekend: RaceWeekend, results: RaceResultEntry[]): Promise<void> {
  const users = await env.DB.prepare(
    `SELECT u.id AS id, u.telegram_user_id AS telegram_user_id,
            up.favorite_driver_id AS favorite_driver_id,
            up.favorite_driver_2_id AS favorite_driver_2_id,
            up.favorite_constructor_id AS favorite_constructor_id,
            COALESCE(up.language, 'en') AS language
     FROM users u
     JOIN notification_settings ns ON ns.user_id = u.id
     JOIN user_preferences up ON up.user_id = u.id
     WHERE ns.enabled = 1 AND ns.favorite_driver_result_enabled = 1
       AND (up.favorite_driver_id IS NOT NULL OR up.favorite_driver_2_id IS NOT NULL OR up.favorite_constructor_id IS NOT NULL)`,
  ).all<FavoritesUser>();

  if (!users.results || users.results.length === 0) return;

  const key = `results:${weekend.id}:favorites`;

  for (const user of users.results) {
    if (await wasAlreadySent(env, user.id, key)) continue;

    const lines: string[] = [];
    const seenDriverIds = new Set<string>();

    for (const driverId of [user.favorite_driver_id, user.favorite_driver_2_id]) {
      if (!driverId || seenDriverIds.has(driverId)) continue; // на случай если оба поля указывают на одного и того же пилота
      seenDriverIds.add(driverId);
      const entry = results.find((r) => r.driver.id === driverId);
      if (entry) lines.push(formatDriverResultLine(user.language, entry));
    }

    if (user.favorite_constructor_id) {
      const teamEntries = results.filter((r) => r.constructor.id === user.favorite_constructor_id);
      for (const entry of teamEntries) {
        if (seenDriverIds.has(entry.driver.id)) continue; // не дублируем пилота, если он же выбран лично
        lines.push(formatDriverResultLine(user.language, entry));
      }
    }

    if (lines.length === 0) continue; // ни один фаворит не участвовал в этой гонке
    const message = formatFavoritesMessage(user.language, weekend, lines);
    const delivered = await deliverNotification(env, user.id, user.telegram_user_id, message);
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
    `SELECT u.id AS id, u.telegram_user_id AS telegram_user_id, COALESCE(up.language, 'en') AS language
     FROM users u
     JOIN notification_settings ns ON ns.user_id = u.id
     LEFT JOIN user_preferences up ON up.user_id = u.id
     WHERE ns.enabled = 1 AND ns.championship_change_enabled = 1`,
  ).all<NotifiableUser>();

  if (!users.results || users.results.length === 0) return;

  const key = `leader-change:${weekend.id}`;

  for (const user of users.results) {
    if (await wasAlreadySent(env, user.id, key)) continue;
    const message = formatChampionshipLeaderMessage(user.language, weekend, leader);
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
  await notifyFavorites(env, weekend, detail.raceResults);
  await notifyChampionshipLeaderChange(env, weekend);
}
