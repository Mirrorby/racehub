import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "00d 00h 00m";
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return `${String(days).padStart(2, "0")}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
}

interface CountdownProps {
  targetUtc: string;
}

/** Countdown до session/race start. Тикает раз в минуту — достаточно для UI, без лишних ре-рендеров. */
export function Countdown({ targetUtc }: CountdownProps) {
  const target = new Date(targetUtc).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  return <span className="rh-countdown">{formatRemaining(target - now)}</span>;
}
