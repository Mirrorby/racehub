import { Router } from "itty-router";
import type { Env } from "./env";
import { handleTelegramAuth } from "./routes/auth";
import { handleBootstrap } from "./routes/bootstrap";
import { handleCalendar } from "./routes/calendar";
import { handleRaceDetail } from "./routes/race";
import { handleStandings } from "./routes/standings";
import { handleUpdatePreferences } from "./routes/preferences";
import { handleUpdateNotificationSettings } from "./routes/notifications";
import { handleDriverCareer, handleConstructorCareer, handleTrackHistory } from "./routes/career";
import { runSessionReminders } from "./notifications/sessionReminders";
import { runResultNotifications } from "./notifications/resultNotifications";
import { runDataSync } from "./cron/dataSync";
import { CORS_HEADERS, errorResponse, jsonResponse } from "./lib/http";
import { UnauthorizedError } from "./lib/requireAuth";
import { errorReason } from "./lib/errors";

const router = Router();

router.options("*", () => new Response(null, { status: 204, headers: CORS_HEADERS }));

router.get("/api/health", () => jsonResponse({ status: "ok" }));

router.post("/api/auth/telegram", (request, env: Env) => handleTelegramAuth(request, env));

router.get("/api/bootstrap", (request, env: Env) => handleBootstrap(request, env));

router.get("/api/calendar", (request, env: Env) => handleCalendar(request, env));

router.get("/api/race/:id", (request, env: Env) => handleRaceDetail(request, env, request.params.id));

router.get("/api/standings/:type", (request, env: Env) => handleStandings(request, env, request.params.type));

router.put("/api/preferences", (request, env: Env) => handleUpdatePreferences(request, env));

router.put("/api/notifications/settings", (request, env: Env) => handleUpdateNotificationSettings(request, env));

router.get("/api/drivers/:id/career", (request, env: Env) => handleDriverCareer(request, env, request.params.id));

router.get("/api/constructors/:id/career", (request, env: Env) =>
  handleConstructorCareer(request, env, request.params.id),
);

router.get("/api/circuits/:id/history", (request, env: Env) => handleTrackHistory(request, env, request.params.id));

router.all("*", () => errorResponse("Not found", 404));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await router.fetch(request, env);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return errorResponse(err.message, 401);
      }
      console.error("Unhandled error:", err);
      return errorResponse("Internal server error", 500);
    }
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    // "*/15 * * * *" — наполнение D1 (cron/dataSync.ts): календарь,
    // standings, результаты этапов, карьерная статистика, история трасс,
    // цвета команд. Отдельный триггер, а не расширение "*/5 * * * *" ниже:
    // наполнение D1 может занимать заметно больше времени на тик (до
    // десятка последовательных подзапросов с паузами, см.
    // syncRoundResults.ts), и не должно откладывать/задерживать
    // time-sensitive напоминания о сессиях.
    if (controller.cron === "*/15 * * * *") {
      try {
        await runDataSync(env);
      } catch (err) {
        console.error(`runDataSync failed: ${errorReason(err)}`);
      }
      return;
    }

    try {
      await runSessionReminders(env);
    } catch (err) {
      console.error("runSessionReminders failed:", err);
    }

    try {
      await runResultNotifications(env);
    } catch (err) {
      console.error("runResultNotifications failed:", err);
    }
  },
};
