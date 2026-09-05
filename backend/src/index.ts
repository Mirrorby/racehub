import { Router } from "itty-router";
import type { Env } from "./env";
import { handleTelegramAuth } from "./routes/auth";
import { handleBootstrap } from "./routes/bootstrap";
import { handleCalendar } from "./routes/calendar";
import { handleStandings } from "./routes/standings";
import { CORS_HEADERS, errorResponse, jsonResponse } from "./lib/http";
import { UnauthorizedError } from "./lib/requireAuth";

const router = Router();

router.options("*", () => new Response(null, { status: 204, headers: CORS_HEADERS }));

router.get("/api/health", () => jsonResponse({ status: "ok" }));

router.post("/api/auth/telegram", (request, env: Env) => handleTelegramAuth(request, env));

router.get("/api/bootstrap", (request, env: Env) => handleBootstrap(request, env));

router.get("/api/calendar", (request, env: Env) => handleCalendar(request, env));

router.get("/api/standings/:type", (request, env: Env) => handleStandings(request, env, request.params.type));

// TODO(Этап 2): /api/race/:id, /api/drivers, /api/constructors
// TODO(Этап 3): /api/preferences (PUT), /api/notifications/settings (PUT)

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
};
