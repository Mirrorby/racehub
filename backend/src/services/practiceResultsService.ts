import type { Env } from "../env";
import { getOrRefresh } from "../lib/cache";
import * as openf1 from "../providers/openf1";
import { findSessionCached, buildDriverCodeIndex, buildConstructorNameIndex, normalizeTeamName } from "./liveResultsService";
import type { PracticeResultEntry, QualifyingResultEntry, RaceWeekend } from "../types";

const TIMING_TTL_SECONDS = 5 * 60;

// В секундах, с плавающей точкой (напр. 81.045) -> "1:21.045".
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

function resolveDriverAndConstructorSync(
  driverMeta: openf1.RawOpenF1Driver,
  driverCodeIndex: Map<string, { id: string; fullName: string }>,
  constructorNameIndex: Map<string, { id: string; name: string }>,
): { driver: { id: string; fullName: string }; constructor: { id: string; name: string } } {
  const driver = driverCodeIndex.get(driverMeta.name_acronym) ?? {
    id: `openf1-${driverMeta.driver_number}`,
    fullName: driverMeta.full_name,
  };
  const constructor = constructorNameIndex.get(normalizeTeamName(driverMeta.team_name)) ?? {
    id: normalizeTeamName(driverMeta.team_name).replace(/\s+/g, "_"),
    name: driverMeta.team_name,
  };
  return { driver, constructor };
}

/**
 * Результаты практики (FP1/FP2/FP3) — через /laps + /position, а НЕ через
 * /session_result. Причина: /session_result документирован как рабочий
 * для всех типов сессий, но по факту для практик либо пуст, либо
 * ненадёжен — подтверждено официальной оговоркой OpenF1 самих
 * ("Practice sessions: Limited data compared to races") и тем, что как
 * минимум один другой активно работающий F1-компаньон вынужден считать
 * практики точно так же (через /laps), а не через /session_result.
 *
 * Лучший круг = минимальный lap_duration среди кругов пилота, не
 * являющихся выездом из пит-лейна (is_pit_out_lap=false) и не null
 * (lap_duration бывает null даже для реально пройденных кругов — известный
 * пробел в самом OpenF1, не наша ошибка). Финальная позиция = последняя
 * по времени запись в /position на этого пилота.
 */
export async function getPracticeResults(
  env: Env,
  weekend: RaceWeekend,
  sessionType: "fp1" | "fp2" | "fp3",
): Promise<PracticeResultEntry[] | null> {
  const session = await findSessionCached(env, weekend, sessionType);
  if (!session) return null;

  return getOrRefresh(env, `openf1:practice:${sessionType}:${weekend.id}`, TIMING_TTL_SECONDS, async () => {
    const [laps, positions, drivers] = await Promise.all([
      openf1.getLaps(session.session_key),
      openf1.getPositions(session.session_key),
      openf1.getSessionDrivers(session.session_key),
    ]);
    if (drivers.length === 0) return null;

    // Лучший круг на пилота
    const bestLapByDriver = new Map<number, number>();
    for (const lap of laps) {
      if (lap.is_pit_out_lap || lap.lap_duration == null) continue;
      const current = bestLapByDriver.get(lap.driver_number);
      if (current == null || lap.lap_duration < current) {
        bestLapByDriver.set(lap.driver_number, lap.lap_duration);
      }
    }
    if (bestLapByDriver.size === 0) return null; // apstream ещё не опубликовал круги

    // Финальная позиция на пилота — последняя по дате запись
    const latestPositionByDriver = new Map<number, { position: number; date: string }>();
    for (const p of positions) {
      const current = latestPositionByDriver.get(p.driver_number);
      if (!current || p.date > current.date) {
        latestPositionByDriver.set(p.driver_number, { position: p.position, date: p.date });
      }
    }

    const fastestOverall = Math.min(...bestLapByDriver.values());
    const driversByNumber = new Map(drivers.map((d) => [d.driver_number, d]));
    const [driverCodeIndex, constructorNameIndex] = await Promise.all([
      buildDriverCodeIndex(env),
      buildConstructorNameIndex(env),
    ]);

    const entries: PracticeResultEntry[] = [];
    for (const [driverNumber, bestLap] of bestLapByDriver.entries()) {
      const driverMeta = driversByNumber.get(driverNumber);
      if (!driverMeta) continue;
      const { driver, constructor } = resolveDriverAndConstructorSync(driverMeta, driverCodeIndex, constructorNameIndex);
      const positionInfo = latestPositionByDriver.get(driverNumber);
      const gap = bestLap - fastestOverall;
      entries.push({
        // Если /position ничего не дал (бывает на коротких/прерванных
        // сессиях) — ранжируем по лучшему кругу самостоятельно, не
        // показываем случайный порядок.
        position: positionInfo?.position ?? 0,
        positionText: positionInfo ? String(positionInfo.position) : "—",
        driver: { id: driver.id, code: driverMeta.name_acronym, fullName: driver.fullName },
        constructor,
        bestLapTime: formatLapTime(bestLap),
        gapToLeader: gap > 0.0005 ? formatGap(gap) : null,
        laps: laps.filter((l) => l.driver_number === driverNumber && !l.is_pit_out_lap).length,
      });
    }

    entries.sort((a, b) => {
      if (a.position && b.position) return a.position - b.position;
      // Без данных /position сортируем по факту скорости — вычисляем
      // обратно из gap (null=лидер=0).
      const aGap = a.gapToLeader ? Number(a.gapToLeader.slice(1)) : 0;
      const bGap = b.gapToLeader ? Number(b.gapToLeader.slice(1)) : 0;
      return aGap - bGap;
    });
    // Если /position не дал ничего ни для кого — проставляем позиции по
    // получившемуся порядку, чтобы на экране не было одних прочерков.
    if (entries.every((e) => e.position === 0)) {
      entries.forEach((e, i) => {
        e.position = i + 1;
        e.positionText = String(i + 1);
      });
    }

    return entries.length > 0 ? entries : null;
  });
}

/**
 * Спринт-квалификация — через OpenF1 /session_result, с полным разбиением
 * по стадиям (SQ1/SQ2/SQ3), а не одним "лучшим" временем. У Jolpica нет
 * отдельного эндпоинта под эту сессию (см. providers/jolpica.ts), поэтому
 * альтернативы OpenF1 нет. Форма duration/gap_to_leader для сессий типа
 * "квалификация" — массив по стадиям (подтверждено тестовой фикстурой
 * реального Rust-клиента OpenF1) — здесь используем это напрямую, не
 * схлопывая через unwrapFlexibleNumber, в отличие от практик.
 */
export async function getSprintQualifyingResults(env: Env, weekend: RaceWeekend): Promise<QualifyingResultEntry[] | null> {
  const session = await findSessionCached(env, weekend, "sprint_quali");
  if (!session) return null;

  return getOrRefresh(env, `openf1:sprint-quali:${weekend.id}`, TIMING_TTL_SECONDS, async () => {
    const [results, drivers] = await Promise.all([
      openf1.getSessionResult(session.session_key),
      openf1.getSessionDrivers(session.session_key),
    ]);
    if (results.length === 0) return null;

    const driversByNumber = new Map(drivers.map((d) => [d.driver_number, d]));
    const [driverCodeIndex, constructorNameIndex] = await Promise.all([
      buildDriverCodeIndex(env),
      buildConstructorNameIndex(env),
    ]);
    const entries: QualifyingResultEntry[] = [];

    for (const row of results) {
      const driverMeta = driversByNumber.get(row.driver_number);
      if (!driverMeta) continue;
      const { driver, constructor } = resolveDriverAndConstructorSync(driverMeta, driverCodeIndex, constructorNameIndex);
      const stages = Array.isArray(row.duration) ? row.duration : row.duration != null ? [row.duration] : [];
      entries.push({
        position: row.position ?? 0,
        driver: { id: driver.id, code: driverMeta.name_acronym, fullName: driver.fullName },
        constructor,
        q1: stages[0] != null ? formatLapTime(stages[0]) : null,
        q2: stages[1] != null ? formatLapTime(stages[1]) : null,
        q3: stages[2] != null ? formatLapTime(stages[2]) : null,
      });
    }

    entries.sort((a, b) => a.position - b.position);
    return entries.length > 0 ? entries : null;
  });
}
