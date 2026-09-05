import type { Env } from "../env";
import { getOrRefresh } from "../lib/cache";
import { errorResponse, jsonResponse } from "../lib/http";
import { mapConstructorStandings, mapDriverStandings } from "../mappers/standings";
import { getConstructorStandings, getDriverStandings } from "../providers/jolpica";
import type { StandingsResponse, StandingsType } from "../types";

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
  const { season, standings } = await getOrRefresh(env, "standings:drivers", STANDINGS_TTL_SECONDS, getDriverStandings);
  return { season, type: "drivers", standings: mapDriverStandings(standings) };
}

async function buildConstructorStandings(env: Env): Promise<StandingsResponse> {
  const { season, standings } = await getOrRefresh(
    env,
    "standings:constructors",
    STANDINGS_TTL_SECONDS,
    getConstructorStandings,
  );
  return { season, type: "constructors", standings: mapConstructorStandings(standings) };
}
