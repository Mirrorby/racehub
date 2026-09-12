import type { Env } from "../env";
import { getOrRefresh } from "../lib/cache";
import { getQualifyingResults, getRaceResults, getSprintResults } from "../providers/jolpica";
import { mapQualifyingResults, mapRaceResults, mapSprintResults } from "../mappers/raceResults";
import { getFastRaceResults } from "./liveResultsService";
import { getPracticeResults, getSprintQualifyingResults } from "./practiceResultsService";
import { getSeasonCalendar } from "./calendarService";
import type { PracticeResultEntry, RaceDetailResponse, RaceResultEntry, RaceWeekend, SessionType } from "../types";

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

async function resolveSprintResults(env: Env, weekend: RaceWeekend): Promise<RaceResultEntry[] | null> {
  // В отличие от гонки, для спринта пока нет отдельного OpenF1 fast-path —
  // спринты значительно реже (не каждый уик-энд) и "быстрые" результаты
  // там менее критичны, чем для основной гонки. При желании можно добавить
  // симметрично resolveRaceResults, переиспользовав getFastRaceResults с
  // sessionType="sprint" (сигнатура уже это поддерживает).
  return getOrRefresh(env, `sprint:${weekend.id}`, RESULTS_TTL_SECONDS, () => getSprintResults(weekend.round)).then(
    (raw) => (raw.length > 0 ? mapSprintResults(raw) : null),
  );
}

async function resolvePracticeResults(
  env: Env,
  weekend: RaceWeekend,
): Promise<Partial<Record<"fp1" | "fp2" | "fp3", PracticeResultEntry[] | null>>> {
  const practiceTypes: SessionType[] = ["fp1", "fp2", "fp3"];
  const relevant = practiceTypes.filter((type) => {
    const session = weekend.sessions.find((s) => s.type === type);
    return session && session.status !== "upcoming";
  }) as Array<"fp1" | "fp2" | "fp3">;

  if (relevant.length === 0) return {};

  // Последовательно, не Promise.all — на странице гонки это уже пятый+
  // параллельный поход в OpenF1 (race/sprint_quali туда же), а у OpenF1
  // нет опубликованных официальных лимитов, но на практике он регулярно
  // отдаёт 429 именно на таких "холодных" всплесках — подтверждено
  // независимо другим реально работающим F1-компаньоном на той же связке
  // API. Retry с backoff в fetchJson (providers/openf1.ts) уже спасает от
  // единичного 429, но не отменяет смысла просто не долбить впараллель
  // тем, что не обязано быть мгновенным (в отличие от race-результатов).
  const results: Array<PracticeResultEntry[] | null> = [];
  for (const type of relevant) {
    const result = await getPracticeResults(env, weekend, type).catch((err) => {
      console.error(`OpenF1 practice results failed for ${weekend.id}/${type}:`, err);
      return null;
    });
    results.push(result);
  }

  const out: Partial<Record<"fp1" | "fp2" | "fp3", PracticeResultEntry[] | null>> = {};
  relevant.forEach((type, i) => {
    out[type] = results[i];
  });
  return out;
}

export async function getRaceDetail(env: Env, id: string): Promise<RaceDetailResponse | null> {
  const { races } = await getSeasonCalendar(env);
  const weekend = races.find((race) => race.id === id);
  if (!weekend) return null;

  const qualifyingSession = weekend.sessions.find((s) => s.type === "qualifying");
  const raceSession = weekend.sessions.find((s) => s.type === "race");
  const sprintSession = weekend.sessions.find((s) => s.type === "sprint");
  const sprintQualiSession = weekend.sessions.find((s) => s.type === "sprint_quali");

  const [qualifyingResults, raceResults, sprintResults, practiceResults, sprintQualifyingResults] = await Promise.all([
    qualifyingSession && qualifyingSession.status !== "upcoming"
      ? getOrRefresh(env, `qualifying:${id}`, RESULTS_TTL_SECONDS, () => getQualifyingResults(weekend.round)).then(
          mapQualifyingResults,
        )
      : Promise.resolve(null),
    raceSession && raceSession.status !== "upcoming" ? resolveRaceResults(env, weekend) : Promise.resolve(null),
    sprintSession && sprintSession.status !== "upcoming" ? resolveSprintResults(env, weekend) : Promise.resolve(null),
    resolvePracticeResults(env, weekend),
    sprintQualiSession && sprintQualiSession.status !== "upcoming"
      ? getSprintQualifyingResults(env, weekend).catch((err) => {
          console.error(`OpenF1 sprint qualifying results failed for ${weekend.id}:`, err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  // Апстрим публикует официальные результаты не мгновенно после финиша —
  // пока их нет, отдаём null, а не пустой массив, чтобы фронт мог
  // отличить "результатов ещё нет" от "сессия не началась".
  return {
    weekend,
    qualifyingResults: qualifyingResults && qualifyingResults.length > 0 ? qualifyingResults : null,
    raceResults: raceResults && raceResults.length > 0 ? raceResults : null,
    sprintResults: sprintResults && sprintResults.length > 0 ? sprintResults : null,
    practiceResults,
    sprintQualifyingResults,
  };
}
