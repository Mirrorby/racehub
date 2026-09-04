import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { telegram, isRunningInTelegram, getRawInitData } from "./telegram/webApp";
import { applyTheme, subscribeToTelegramThemeChanges } from "./telegram/theme";
import { authenticateWithTelegram } from "./api/auth";
import { setSessionToken } from "./api/client";
import { Splash } from "./pages/Splash";
import { Home } from "./pages/Home";
import { Calendar } from "./pages/Calendar";
import { Standings } from "./pages/Standings";
import { More } from "./pages/More";
import { Onboarding } from "./pages/Onboarding";
import { BottomNavigation } from "./components/BottomNavigation";
import { ErrorState } from "./components/ErrorState";

type BootStatus = "loading" | "ready" | "error" | "not_in_telegram";

export function App() {
  const [status, setStatus] = useState<BootStatus>("loading");
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

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
      } catch {
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
          <ErrorState message="Couldn't sign you in. Please reopen the app from Telegram." onRetry={() => window.location.reload()} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNavigation />
    </div>
  );
}
