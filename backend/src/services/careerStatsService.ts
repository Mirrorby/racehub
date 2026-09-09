

import type { Env } from "../env";
import { getOrRefresh } from "../lib/cache";
import * as jolpica from "../providers/jolpica";
import type { DriverCareerStats, ConstructorCareerStats } from "../types";

// Карьерная статистика меняется максимум раз за уик-энд, а для большинства
// пилотов/команд — куда реже. Долгий TTL — осознанный выбор: это также
// бережёт бюджет запросов к Jolpica, учитывая, что один расчёт здесь может
// стоить больше десятка вызовов (постраничная агрегация результатов +
// квалификаций + цикл по сезонам ради титулов).
const CAREER_TTL_SECONDS = 12 * 60 * 60;
// Верхняя граница на цикл по сезонам (титулы) — ни один пилот/команда в
// истории F1 не участвовали больше ~20 сезонов, 25 — запас с хорошим
// запасом на будущее.
const MAX_SEASONS_FOR_TITLES = 25;

export async function getDriverCareerStats(env: Env, driverId: string): Promise<DriverCareerStats | null> {
  return getOrRefresh(env, `career:driver:${driverId}`, CAREER_TTL_SECONDS, async () => {
    const driverInfo = await jolpica.getDriverInfo(driverId);
    if (!driverInfo) return null;

    const [summary, poles, seasons] = await Promise.all([
      jolpica.getDriverCareerResults(driverId),
      jolpica.getCareerPoles(driverId),
      jolpica.getEntitySeasons(`/drivers/${driverId}`),
    ]);

    const seasonsToCheck = seasons.slice(0, MAX_SEASONS_FOR_TITLES);
    const positions = await Promise.all(
      seasonsToCheck.map((season) => jolpica.getDriverSeasonPosition(season, driverId)),
    );
    const championships = positions.filter((p) => p === 1).length;

    return {
      wins: summary.wins,
      podiums: summary.podiums,
      poles,
      points: summary.points,
      championships,
      firstSeason: summary.firstSeason,
      lastSeason: summary.lastSeason,
      dateOfBirth: driverInfo.dateOfBirth ?? null,
      nationality: driverInfo.nationality,
    };
  });
}

export async function getConstructorCareerStats(env: Env, constructorId: string): Promise<ConstructorCareerStats | null> {
  return getOrRefresh(env, `career:constructor:${constructorId}`, CAREER_TTL_SECONDS, async () => {
    const [summary, seasons] = await Promise.all([
      jolpica.getConstructorCareerResults(constructorId),
      jolpica.getEntitySeasons(`/constructors/${constructorId}`),
    ]);

    if (summary.firstSeason === null) return null;

    const seasonsToCheck = seasons.slice(0, MAX_SEASONS_FOR_TITLES);
    const positions = await Promise.all(
      seasonsToCheck.map((season) => jolpica.getConstructorSeasonPosition(season, constructorId)),
    );
    const championships = positions.filter((p) => p === 1).length;

    return {
      wins: summary.wins,
      podiums: summary.podiums,
      points: summary.points,
      championships,
      firstSeason: summary.firstSeason,
      lastSeason: summary.lastSeason,
      // Шасси/мотор/руководитель команды/база — Jolpica этого не отдаёт в
      // принципе (не гоночные результаты, а орг. данные команды), это
      // единственное, для чего нужен отдельный курируемый датасет — см.
      // пометку в TeamDetail.tsx.
    };
  });
}
