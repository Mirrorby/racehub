import type { Env } from "../env";
import { getOrRefresh } from "../lib/cache";
import { errorResponse, jsonResponse } from "../lib/http";
import { mapConstructorStandings, mapDriverStandings } from "../mappers/standings";
import { getConstructorStandings, getDriverStandings } from "../providers/jolpica";
import { getFastConstructorStandings, getFastDriverStandings } from "../services/liveResultsService";
import { getMostRecentStartedRace } from "../services/calendarService";
import type { StandingsResponse, StandingsType, RaceWeekend } from "../types";

// Во время сезона очки обновляются раз за уик-энд (см. обсуждение частоты
// обновлений апстрима), но во время самой гонки нам важно относительно
// оперативно подхватить свежий результат — поэтому TTL короче, чем у
// календаря.
const STANDINGS_TTL_SECONDS = 15 * 60;

export async function handleStandings(request: Request, env: Env, type: string): Promise<Response> {
  if (type !== "drivers" && type !== "constructors") {
    return errorResponse("type must be 'drivers' or 'constructors'", 400);
  }
  const standingsType = type as StandingsType;

  const body: StandingsResponse =
    standingsType === "drivers"
      ? await buildDriverStandings(env)
      : await buildConstructorStandings(env);

  return jsonResponse(body);
}

async function buildDriverStandings(env: Env): Promise<StandingsResponse> {
  const fast = await tryFastStandings(env, getFastDriverStandings);
  if (fast) return { season: fast.season, type: "drivers", standings: fast.standings };

  const { season, standings } = await getOrRefresh(env, "standings:drivers", STANDINGS_TTL_SECONDS, getDriverStandings);
  return { season, type: "drivers", standings: mapDriverStandings(standings) };
}

async function buildConstructorStandings(env: Env): Promise<StandingsResponse> {
  const fast = await tryFastStandings(env, getFastConstructorStandings);
  if (fast) return { season: fast.season, type: "constructors", standings: fast.standings };

  const { season, standings } = await getOrRefresh(
    env,
    "standings:constructors",
    STANDINGS_TTL_SECONDS,
    getConstructorStandings,
  );
  return { season, type: "constructors", standings: mapConstructorStandings(standings) };
}

/**
 * OpenF1 отдаёт снимок standings сразу после последней прошедшей гонки —
 * на порядки быстрее, чем batch-обновления Jolpica. Если гонок в сезоне
 * ещё не было (межсезонье/первый уик-энд) или OpenF1 ещё не в курсе —
 * возвращаем null, вызывающий код откатится на Jolpica.
 */
async function tryFastStandings(
  env: Env,
  fetcher: (env: Env, weekend: RaceWeekend) => Promise<StandingsResponse["standings"] | null>,
): Promise<{ season: number; standings: StandingsResponse["standings"] } | null> {
  const weekend = await getMostRecentStartedRace(env);
  if (!weekend) return null;

  const standings = await fetcher(env, weekend).catch((err) => {
    console.error("OpenF1 fast-path standings failed, falling back to Jolpica:", err);
    return null;
  });
  return standings ? { season: weekend.season, standings } : null;
}
