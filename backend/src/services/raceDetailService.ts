import type { Env } from "../env";
import { getOrRefresh } from "../lib/cache";
import { getQualifyingResults, getRaceResults } from "../providers/jolpica";
import { mapQualifyingResults, mapRaceResults } from "../mappers/raceResults";
import { getFastRaceResults } from "./liveResultsService";
import { getSeasonCalendar } from "./calendarService";
import type { RaceDetailResponse, RaceResultEntry, RaceWeekend } from "../types";

// Результаты в течение уик-энда могут дозаполняться (пенальти после
// разбора стюардов и т.п.), поэтому TTL короткий — 5 минут. Как только
// станет проще отличать "гонка была неделю назад" от "гонка только что
// закончилась", можно удлинять TTL для давних этапов, но пока не критично.
const RESULTS_TTL_SECONDS = 5 * 60;

async function resolveRaceResults(env: Env, weekend: RaceWeekend): Promise<RaceResultEntry[] | null> {
  // OpenF1 публикует официальные результаты гонки в течение нескольких
  // минут после финиша — на порядки быстрее, чем batch-обновления
  // Jolpica (та по своим словам целится в "раз в неделю, в понедельник").
  // Квалификацию через этот путь не гоняем — см. комментарий в
  // liveResultsService.ts.
  const fast = await getFastRaceResults(env, weekend).catch((err) => {
    console.error(`OpenF1 fast-path failed for race results of ${weekend.id}, falling back to Jolpica:`, err);
    return null;
  });
  if (fast) return fast;

  return getOrRefresh(env, `results:${weekend.id}`, RESULTS_TTL_SECONDS, () => getRaceResults(weekend.round)).then(
    (raw) => (raw.length > 0 ? mapRaceResults(raw) : null),
  );
}

export async function getRaceDetail(env: Env, id: string): Promise<RaceDetailResponse | null> {
  const { races } = await getSeasonCalendar(env);
  const weekend = races.find((race) => race.id === id);
  if (!weekend) return null;

  const qualifyingSession = weekend.sessions.find((s) => s.type === "qualifying");
  const raceSession = weekend.sessions.find((s) => s.type === "race");

  const [qualifyingResults, raceResults] = await Promise.all([
    qualifyingSession && qualifyingSession.status !== "upcoming"
      ? getOrRefresh(env, `qualifying:${id}`, RESULTS_TTL_SECONDS, () => getQualifyingResults(weekend.round)).then(
          mapQualifyingResults,
        )
      : Promise.resolve(null),
    raceSession && raceSession.status !== "upcoming" ? resolveRaceResults(env, weekend) : Promise.resolve(null),
  ]);

  // Апстрим публикует официальные результаты не мгновенно после финиша —
  // пока их нет, отдаём null, а не пустой массив, чтобы фронт мог
  // отличить "результатов ещё нет" от "гонка не началась".
  return {
    weekend,
    qualifyingResults: qualifyingResults && qualifyingResults.length > 0 ? qualifyingResults : null,
    raceResults: raceResults && raceResults.length > 0 ? raceResults : null,
  };
}
