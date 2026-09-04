import type { Env } from "../env";
import { resolveSession } from "./sessionRepository";

export async function requireUserId(request: Request, env: Env): Promise<string> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!token) {
    throw new UnauthorizedError("Missing session token");
  }

  const userId = await resolveSession(env, token);
  if (!userId) {
    throw new UnauthorizedError("Invalid or expired session");
  }

  return userId;
}

export class UnauthorizedError extends Error {}
