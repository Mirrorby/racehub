import type { Env } from "../env";
import { getOrRefresh } from "../lib/cache";
import * as openf1 from "../providers/openf1";
import { findSessionCached, buildDriverCodeIndex, buildConstructorNameIndex, normalizeTeamName } from "./liveResultsService";
import type { PracticeResultEntry, RaceWeekend } from "../types";

/**
 * Результаты практик (FP1/FP2/FP3) — доступны ТОЛЬКО через OpenF1. Jolpica
 * принципиально не отдаёт эти данные (подтверждено мейнтейнерами,
 * jolpica-f1/discussions/128) и не планирует добавлять их в существующие
 * /ergast эндпоинты. Это единственный источник, поэтому в отличие от
 * getFastRaceResults здесь нет отката на Jolpica — если OpenF1 недоступен
 * или сессию ещё не нашёл, результата просто нет (null), а не "медленный,
 * но верный" альтернативный путь.
 */
const PRACTICE_TTL_SECONDS = 5 * 60;

// В секундах, с плавающей точкой (напр. 81.045) -> "1:21.045".
// duration/gap_to_leader у OpenF1 меньше часа всегда (лучший круг практики
// физически не может быть настолько долгим), поэтому часы не считаем.
function formatLapTime(seconds: number): string {
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  const millis = Math.round((seconds - whole) * 1000);
  return `${minutes}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function formatGap(seconds: number): string {
  return `+${seconds.toFixed(3)}`;
}

function resultStatus(row: openf1.RawOpenF1SessionResult): "dnf" | "dns" | "dsq" | "ok" {
  if (row.dsq) return "dsq";
  if (row.dns) return "dns";
  if (row.dnf) return "dnf";
  return "ok";
}

function positionText(row: openf1.RawOpenF1SessionResult): string {
  const status = resultStatus(row);
  if (status === "dsq") return "D";
  if (status === "dns") return "W";
  if (status === "dnf") return "R";
  return row.position != null ? String(row.position) : "—";
}

const UNRANKED_SORT_POSITION = 9999;

export async function getPracticeResults(
  env: Env,
  weekend: RaceWeekend,
  sessionType: "fp1" | "fp2" | "fp3",
): Promise<PracticeResultEntry[] | null> {
  const session = await findSessionCached(env, weekend, sessionType);
  if (!session) return null;

  return getOrRefresh(env, `openf1:practice:${weekend.id}:${sessionType}`, PRACTICE_TTL_SECONDS, async () => {
    const [results, drivers] = await Promise.all([
      openf1.getSessionResult(session.session_key),
      openf1.getSessionDrivers(session.session_key),
    ]);
    if (results.length === 0) return null;

    const [driverCodeIndex, constructorNameIndex] = await Promise.all([
      buildDriverCodeIndex(env),
      buildConstructorNameIndex(env),
    ]);

    const driversByNumber = new Map(drivers.map((d) => [d.driver_number, d]));

    const entries: PracticeResultEntry[] = results
      .filter((row) => driversByNumber.has(row.driver_number))
      .map((row) => {
        const driverMeta = driversByNumber.get(row.driver_number)!;
        // Сведение по 3-буквенному коду — см. подробный комментарий у того
        // же паттерна в liveResultsService.ts::getFastRaceResults.
        const driver = driverCodeIndex.get(driverMeta.name_acronym) ?? {
          id: `openf1-${row.driver_number}`,
          fullName: driverMeta.full_name,
        };
        const constructor = constructorNameIndex.get(normalizeTeamName(driverMeta.team_name)) ?? {
          id: normalizeTeamName(driverMeta.team_name).replace(/\s+/g, "_"),
          name: driverMeta.team_name,
        };

        return {
          position: row.position ?? UNRANKED_SORT_POSITION,
          positionText: positionText(row),
          driver: { id: driver.id, code: driverMeta.name_acronym, fullName: driver.fullName },
          constructor,
          bestLapTime: row.duration != null ? formatLapTime(row.duration) : null,
          gapToLeader: row.gap_to_leader != null ? formatGap(row.gap_to_leader) : null,
          laps: row.number_of_laps ?? 0,
        };
      })
      .sort((a, b) => a.position - b.position);

    return entries.length > 0 ? entries : null;
  });
}
