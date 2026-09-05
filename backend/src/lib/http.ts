export const CORS_HEADERS: Record<string, string> = {
  // Telegram Mini App работает внутри WebView Telegram; в dev фронт может
  // ходить с другого origin (localhost:5173) — открытый CORS безопасен,
  // т.к. чувствительные данные защищены session token, а не origin-ом.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

/**
 * Единый формат ответа об ошибке — { error: string } — чтобы фронту не
 * приходилось угадывать форму тела в зависимости от того, где именно
 * запрос упал (роут, requireAuth, необработанное исключение).
 */
export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}
