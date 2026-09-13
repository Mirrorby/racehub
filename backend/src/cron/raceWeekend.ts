import type { RaceWeekend } from "../types";

/**
 * "Гоночный уик-энд" здесь = Пт 00:00 UTC — Вс 23:59:59 UTC относительно
 * даты сессии race ближайшего/текущего этапа. Не претендует на точность
 * до часа (реальные уик-энды иногда сдвинуты, напр. ночные сессии Лас-
 * Вегаса) — этого достаточно для решения "обновлять раз в 15 минут или
 * раз в 6 часов", где ошибка на несколько часов не критична.
 */
export function isRaceWeekend(races: RaceWeekend[], now: Date = new Date()): boolean {
  for (const race of races) {
    const raceSession = race.sessions.find((s) => s.type === "race");
    if (!raceSession) continue;

    const raceDate = new Date(raceSession.startUtc);
    const fridayStart = new Date(raceDate);
    fridayStart.setUTCDate(raceDate.getUTCDate() - 2);
    fridayStart.setUTCHours(0, 0, 0, 0);

    const mondayStart = new Date(raceDate);
    mondayStart.setUTCDate(raceDate.getUTCDate() + 1);
    mondayStart.setUTCHours(0, 0, 0, 0);

    if (now >= fridayStart && now < mondayStart) return true;
  }
  return false;
}
