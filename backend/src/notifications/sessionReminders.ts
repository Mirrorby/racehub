import type { Env } from "../env";
import { getSeasonCalendar } from "../services/calendarService";
import { sendTelegramMessage } from "../lib/telegramBot";
import type { RaceWeekend, Session, SessionType } from "../types";

/**
 * У notification_settings всего 4 категории (race/qualifying/sprint/
 * practice), а у сессий их 7 (fp1/fp2/fp3/sprint_quali/sprint/qualifying/
 * race). Мапим так:
 * - fp1/fp2/fp3       -> practice   (одна настройка на все практики)
 * - sprint_quali      -> qualifying (это квалификационная сессия по формату)
 * - sprint, qualifying, race -> сами по себе
 */
const SESSION_CATEGORY: Record<SessionType, keyof typeof CATEGORY_COLUMNS> = {
  fp1: "practice",
  fp2: "practice",
  fp3: "practice",
  sprint_quali: "qualifying",
  sprint: "sprint",
  qualifying: "qualifying",
  race: "race",
};

const CATEGORY_COLUMNS = {
  race: { enabledCol: "race_enabled", minutesCol: "race_minutes_before" },
  qualifying: { enabledCol: "qualifying_enabled", minutesCol: "qualifying_minutes_before" },
  sprint: { enabledCol: "sprint_enabled", minutesCol: "sprint_minutes_before" },
  practice: { enabledCol: "practice_enabled", minutesCol: "practice_minutes_before" },
} as const;

interface CandidateUser {
  id: string;
  telegram_user_id: number;
  minutes_before: number;
}

function sessionEmoji(type: SessionType): string {
  if (type === "race") return "🏁";
  if (type === "qualifying" || type === "sprint_quali") return "⏱️";
  if (type === "sprint") return "🚀";
  return "🔧";
}

function formatMessage(weekend: RaceWeekend, session: Session, minutesBefore: number): string {
  const emoji = sessionEmoji(session.type);
  return (
    `${emoji} <b>${weekend.name}</b>\n` +
    `${session.label} starts in ${minutesBefore} min.\n` +
    `📍 ${weekend.circuit}, ${weekend.city}`
  );
}

/**
 * Для одной сессии находит пользователей, которым пора отправить
 * напоминание прямо сейчас, и отправляет. Идемпотентность — через
 * UNIQUE(user_id, notification_key) в notification_log: если запись уже
 * есть, INSERT молча не проходит (ON CONFLICT DO NOTHING), и мы просто
 * пропускаем отправку.
 */
async function processSession(env: Env, weekend: RaceWeekend, session: Session, now: Date): Promise<number> {
  const category = SESSION_CATEGORY[session.type];
  const { enabledCol, minutesCol } = CATEGORY_COLUMNS[category];
  const sessionStart = new Date(session.startUtc);
  if (sessionStart <= now) return 0; // сессия уже началась — напоминать поздно

  // Кандидаты: у кого включены уведомления вообще и включена эта
  // категория, и при этом их персональный minutes_before уже наступил
  // (now >= start - minutes_before), но сессия ещё не началась.
  const candidates = await env.DB.prepare(
    `SELECT u.id AS id, u.telegram_user_id AS telegram_user_id, ns.${minutesCol} AS minutes_before
     FROM users u
     JOIN notification_settings ns ON ns.user_id = u.id
     WHERE ns.enabled = 1 AND ns.${enabledCol} = 1
       AND datetime(?) >= datetime(?, '-' || ns.${minutesCol} || ' minutes')`,
  )
    .bind(now.toISOString(), sessionStart.toISOString())
    .all<CandidateUser>();

  let sentCount = 0;
  const notificationKey = `session:${weekend.id}:${session.type}`;

  for (const user of candidates.results ?? []) {
    const inserted = await env.DB.prepare(
      `INSERT INTO notification_log (id, user_id, notification_key) VALUES (?, ?, ?)
       ON CONFLICT (user_id, notification_key) DO NOTHING`,
    )
      .bind(crypto.randomUUID(), user.id, notificationKey)
      .run();

    if (inserted.meta.changes === 0) continue; // уже отправляли

    await sendTelegramMessage(env, user.telegram_user_id, formatMessage(weekend, session, user.minutes_before));
    sentCount++;
  }

  return sentCount;
}

/**
 * Точка входа для scheduled-триггера (см. wrangler.toml [triggers]).
 *
 * Известное упрощение: смотрим только на ближайший незавершённый
 * уик-энд, а не на весь календарь. Для reminder-ов этого достаточно —
 * следующая после него гонка всегда дальше, чем максимальный
 * minutes_before (1440 мин / 24ч), так что до неё в любом случае рано
 * слать. Также не реализованы result-based уведомления
 * (favoriteDriverResultEnabled/championshipChangeEnabled/resultsEnabled) —
 * это требует ленты результатов по сессии, которой пока нет в data layer.
 */
export async function runSessionReminders(env: Env): Promise<void> {
  const { races } = await getSeasonCalendar(env);
  const now = new Date();
  const weekend = races.find((race) => race.status !== "completed");
  if (!weekend) return;

  let totalSent = 0;
  for (const session of weekend.sessions) {
    totalSent += await processSession(env, weekend, session, now);
  }

  if (totalSent > 0) {
    console.log(`Sent ${totalSent} session reminder(s) for ${weekend.name}`);
  }
}
