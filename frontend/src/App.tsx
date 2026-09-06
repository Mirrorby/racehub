import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { telegram, isRunningInTelegram, getRawInitData } from "./telegram/webApp";
import { applyTheme, subscribeToTelegramThemeChanges } from "./telegram/theme";
import { authenticateWithTelegram } from "./api/auth";
import { ApiError, API_BASE_URL, setSessionToken } from "./api/client";
import { Splash } from "./pages/Splash";
import { Home } from "./pages/Home";
import { Calendar } from "./pages/Calendar";
import { Standings } from "./pages/Standings";
import { More } from "./pages/More";
import { SelectFavorite } from "./pages/SelectFavorite";
import { NotificationSettingsPage } from "./pages/NotificationSettingsPage";
import { Onboarding } from "./pages/Onboarding";
import { BottomNavigation } from "./components/BottomNavigation";
import { ErrorState } from "./components/ErrorState";

type BootStatus = "loading" | "ready" | "error" | "not_in_telegram";

/**
 * До этого места ошибки авторизации схлопывались в одно generic-сообщение
 * "Couldn't sign you in" независимо от причины — что делает отладку на
 * реальном телефоне (без консоли/логов) практически невозможной. Достаём
 * реальный текст: тело ответа backend для ApiError, либо явную пометку
 * сетевой ошибки (недоступен backend / не тот VITE_API_BASE_URL / CORS).
 */
function describeAuthError(err: unknown): string {
  const suffix = ` — API base: ${API_BASE_URL}`;
  if (err instanceof ApiError) {
    let backendMessage = err.message;
    try {
      const parsed = JSON.parse(err.message) as { error?: string };
      if (parsed.error) backendMessage = parsed.error;
    } catch {
      // тело не JSON — оставляем как есть
    }
    return `Sign-in failed (${err.status}): ${backendMessage}${suffix}`;
  }
  if (err instanceof TypeError) {
    // fetch() бросает TypeError при сетевых сбоях (недоступен хост, CORS
    // заблокировал запрос ещё до ответа, DNS и т.п.) — response тут нет,
    // поэтому ApiError не создаётся.
    return `Can't reach the backend. Check VITE_API_BASE_URL and that the backend Worker is deployed.${suffix}`;
  }
  return `Unexpected error: ${err instanceof Error ? err.message : String(err)}${suffix}`;
}

export function App() {
  const [status, setStatus] = useState<BootStatus>("loading");
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [authError, setAuthError] = useState<string>("");

  useEffect(() => {
    applyTheme("telegram");
    const unsubscribe = subscribeToTelegramThemeChanges("telegram", () => {});

    async function boot() {
      telegram.ready();
      telegram.expand();

      if (!isRunningInTelegram()) {
        // Разработка вне Telegram (обычный браузер) — не блокируем экран,
        // но и не притворяемся авторизованными.
        setStatus("not_in_telegram");
        return;
      }

      try {
        const auth = await authenticateWithTelegram(getRawInitData());
        setSessionToken(auth.sessionToken);
        setNeedsOnboarding(auth.isNewUser);
        setStatus("ready");
      } catch (err) {
        console.error("Telegram auth failed:", err);
        setAuthError(describeAuthError(err));
        setStatus("error");
      }
    }

    boot();
    return unsubscribe;
  }, []);

  if (status === "loading") {
    return <Splash />;
  }

  if (status === "error") {
    return (
      <div className="rh-app-shell">
        <div className="rh-content">
          <ErrorState message={authError} onRetry={() => window.location.reload()} />
        </div>
      </div>
    );
  }

  if (status === "not_in_telegram") {
    return (
      <div className="rh-app-shell">
        <div className="rh-content">
          <ErrorState message="Open this app from Telegram to continue." />
        </div>
      </div>
    );
  }

  if (needsOnboarding) {
    return (
      <div className="rh-app-shell">
        <Onboarding onComplete={() => setNeedsOnboarding(false)} />
      </div>
    );
  }

  return (
    <div className="rh-app-shell">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/standings" element={<Standings />} />
        <Route path="/more" element={<More />} />
        <Route path="/drivers" element={<SelectFavorite type="drivers" />} />
        <Route path="/constructors" element={<SelectFavorite type="constructors" />} />
        <Route path="/more/settings" element={<NotificationSettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNavigation />
    </div>
  );
}
