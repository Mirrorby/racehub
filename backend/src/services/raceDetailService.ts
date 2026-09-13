import type { Env } from "../env";
import { recomputeWeekendStatus } from "../mappers/raceWeekend";
import type { PracticeResultEntry, QualifyingResultEntry, RaceDetailResponse, RaceResultEntry, RaceWeekend } from "../types";

interface SeasonRaceRow {
  weekend_json: string;
  race_results_json: string | null;
  qualifying_json: string | null;
  sprint_json: string | null;
  practice_json: string | null;
  sprint_quali_json: string | null;
}

function parseOrNull<T>(raw: string | null): T | null {
  return raw ? (JSON.parse(raw) as T) : null;
}

/**
 * Раньше здесь жила вся "горячая" оркестровка результатов уик-энда —
 * qualifying+race+sprint+practice×3+sprint_quali, собранные через
 * Promise.all (до 15-20+ параллельных fetch на одно открытие страницы —
 * именно то, что приводило к "A stalled HTTP response was canceled to
 * prevent deadlock" и массово неоткрывающимся страницам гонок).
 *
 * Теперь это одна строка season_races, которую заполняет cron
 * последовательно и по расписанию (см. cron/syncRoundResults.ts — та же
 * логика выбора OpenF1 fast-path/Jolpica-фолбэка, но не на каждый заход
 * пользователя, а в фоне) — здесь только чтение и пересборка формы ответа.
 */
export async function getRaceDetail(env: Env, id: string): Promise<RaceDetailResponse | null> {
  const row = await env.DB.prepare(
    `SELECT weekend_json, race_results_json, qualifying_json, sprint_json, practice_json, sprint_quali_json
     FROM season_races WHERE race_id = ?`,
  )
    .bind(id)
    .first<SeasonRaceRow>();
  if (!row) return null;

  const weekend = recomputeWeekendStatus(JSON.parse(row.weekend_json) as RaceWeekend, new Date());

  return {
    weekend,
    raceResults: parseOrNull<RaceResultEntry[]>(row.race_results_json),
    qualifyingResults: parseOrNull<QualifyingResultEntry[]>(row.qualifying_json),
    sprintResults: parseOrNull<RaceResultEntry[]>(row.sprint_json),
    practiceResults:
      parseOrNull<Partial<Record<"fp1" | "fp2" | "fp3", PracticeResultEntry[] | null>>>(row.practice_json) ?? {},
    sprintQualifyingResults: parseOrNull<QualifyingResultEntry[]>(row.sprint_quali_json),
  };
}
