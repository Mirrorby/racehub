

import type { Env } from "../env";
import { getOrRefresh } from "../lib/cache";
import { sleep } from "../lib/pace";
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

/**
 * Раньше здесь был Promise.all по ВСЕМ сезонам разом — до 25 параллельных
 * запросов к Jolpica одним залпом на подсчёт титулов одного пилота с
 * длинной карьерой. Это было незаметно, пока функция вызывалась только с
 * "горячего" пути (там TTL-кэш почти всегда спасал от повторного
 * попадания сюда) — но с переездом на cron round-robin (см.
 * cron/syncEntityRoundRobin.ts) она стала регулярно вызываться заново на
 * каждого пилота/команду при истечении TTL, и 25 параллельных запросов —
 * прямой путь к 429 (burst-лимит Jolpica 4/сек). Считаем последовательно.
 */
async function countChampionships(seasons: number[], getPosition: (season: number) => Promise<number | null>): Promise<number> {
  let championships = 0;
  for (const season of seasons) {
    const position = await getPosition(season);
    if (position === 1) championships += 1;
    await sleep();
  }
  return championships;
}

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
    const championships = await countChampionships(seasonsToCheck, (season) => jolpica.getDriverSeasonPosition(season, driverId));

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
    const championships = await countChampionships(seasonsToCheck, (season) =>
      jolpica.getConstructorSeasonPosition(season, constructorId),
    );

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
