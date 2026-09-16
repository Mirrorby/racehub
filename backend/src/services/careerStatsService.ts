

import type { Env } from "../env";
import { getOrRefresh } from "../lib/cache";
import * as jolpica from "../providers/jolpica";
import type { DriverCareerStats, ConstructorCareerStats } from "../types";

// Карьерная статистика меняется максимум раз за уик-энд, а для большинства
// пилотов/команд — куда реже. Долгий TTL — осознанный выбор: это также
// бережёт бюджет запросов к Jolpica.
const CAREER_TTL_SECONDS = 12 * 60 * 60;

/**
 * Раньше здесь же, следом за этими "базовыми" полями, считались титулы —
 * циклом по каждому сезону карьеры (до 25 последовательных запросов на
 * пилота с длинной историей). Это и было первопричиной того, что
 * `driver_career`/`constructor_career` не досчитывались до конца:
 * последовательный цикл сам по себе безопасен по burst-лимиту Jolpica, но
 * при 429/5xx на любом шаге `fetchJson` уходит в retry (до 4 попыток на
 * вызов, см. providers/jolpica.ts) — и один вызов этой функции мог
 * реально стоить сильно больше 25 подзапросов, упираясь в лимит Cloudflare
 * на число fetch() за один инвок cron (см. cron/subrequestBudget.ts).
 * Обнаружено 16.09.2026 по факту в проде: driver_career досчитался для
 * 9 из 22 пилотов, и подозрительно систематически — не хватало как раз
 * ветеранов с долгой карьерой (Alonso, Hamilton, Verstappen...).
 *
 * Титулы теперь считает отдельный конвейер (cron/syncTitleProgress.ts),
 * который проверяет по несколько сезонов за тик и не блокирует остальную,
 * куда более дешёвую часть карьерной статистики. championships здесь —
 * всегда null, реальное значение подставляется этим конвейером через
 * прямой UPDATE (см. types.ts — championships: number | null).
 */
export async function getDriverCareerStats(env: Env, driverId: string): Promise<DriverCareerStats | null> {
  return getOrRefresh(env, `career:driver:${driverId}`, CAREER_TTL_SECONDS, async () => {
    const driverInfo = await jolpica.getDriverInfo(driverId);
    if (!driverInfo) return null;

    const [summary, poles] = await Promise.all([jolpica.getDriverCareerResults(driverId), jolpica.getCareerPoles(driverId)]);

    return {
      wins: summary.wins,
      podiums: summary.podiums,
      poles,
      points: summary.points,
      championships: null,
      firstSeason: summary.firstSeason,
      lastSeason: summary.lastSeason,
      dateOfBirth: driverInfo.dateOfBirth ?? null,
      nationality: driverInfo.nationality,
    };
  });
}

export async function getConstructorCareerStats(env: Env, constructorId: string): Promise<ConstructorCareerStats | null> {
  return getOrRefresh(env, `career:constructor:${constructorId}`, CAREER_TTL_SECONDS, async () => {
    const summary = await jolpica.getConstructorCareerResults(constructorId);
    if (summary.firstSeason === null) return null;

    return {
      wins: summary.wins,
      podiums: summary.podiums,
      points: summary.points,
      championships: null,
      firstSeason: summary.firstSeason,
      lastSeason: summary.lastSeason,
      // Шасси/мотор/руководитель команды/база — Jolpica этого не отдаёт в
      // принципе (не гоночные результаты, а орг. данные команды), это
      // единственное, для чего нужен отдельный курируемый датасет — см.
      // routes/career.ts (подмешивает team_details поверх этого объекта).
    };
  });
}
