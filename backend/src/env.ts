export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  ENVIRONMENT: "development" | "production";
  /** Сколько «тяжёлых» фаз синка допускается за один тик cron (по умолчанию 1 — безопасно для Workers Free, 10 мс CPU). На Workers Paid можно поднять до 4. */
  SYNC_PHASES_PER_TICK?: string;
}
