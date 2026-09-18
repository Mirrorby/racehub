import type { RawConstructorStanding, RawDriverStanding } from "../providers/jolpica";
import type { Standing } from "../types";
import { constructorColor } from "./teamColors";

// Ergast не отдаёт изменение позиции относительно предыдущего этапа —
// потребовало бы отдельного запроса standings "на -1 раунд" и сравнения.
// Оставляем как явный TODO, а не гадаем: "unknown" честнее, чем случайная
// стрелочка на UI.
//
// liveColors — constructorId -> "#RRGGBB" из OpenF1 (см.
// liveResultsService.ts::getLiveTeamColors), основной источник цвета.
// Статичная таблица teamColors.ts используется только как fallback —
// когда OpenF1 недоступен или ещё не знает про совсем новую команду.
//
// driverMedia — driverId -> headshot_url из OpenF1 (см.
// liveResultsService.ts::getLiveDriverMedia). В отличие от цвета, у фото
// НЕТ статичного fallback — Jolpica медиа не отдаёт вообще, поэтому
// значение просто null, пока OpenF1 не заведёт снимок для этого пилота.
export function mapDriverStandings(raw: RawDriverStanding[], liveColors?: Map<string, string>, driverMedia?: Map<string, string>): Standing[] {
  const leaderPoints = raw.length > 0 ? Number(raw[0].points) : 0;
  return raw.map((entry) => {
    const constructor = entry.Constructors[entry.Constructors.length - 1];
    const points = Number(entry.points);
    const constructorId = constructor?.constructorId ?? "";
    const color = liveColors?.get(constructorId) ?? constructorColor(constructorId);
    const driverId = entry.Driver.driverId;
    return {
      position: Number(entry.position),
      points,
      wins: Number(entry.wins),
      gapToLeader: points === leaderPoints ? 0 : leaderPoints - points,
      movement: "unknown",
      driver: {
        id: driverId,
        code: entry.Driver.code ?? driverId.slice(0, 3).toUpperCase(),
        number: entry.Driver.permanentNumber ? Number(entry.Driver.permanentNumber) : null,
        fullName: `${entry.Driver.givenName} ${entry.Driver.familyName}`,
        constructorId,
        constructorName: constructor?.name ?? "",
        teamColor: color,
        headshotUrl: driverMedia?.get(driverId) ?? null,
      },
      constructor: constructor ? { id: constructorId, name: constructor.name, color, nationality: constructor.nationality } : undefined,
    };
  });
}

/**
 * Единственная известная аномалия: /current/constructorStandings.json
 * отдаёт другой constructorId (И другое имя) для тех же двух команд, что
 * везде остальные Jolpica-эндпоинты (результаты гонок/квалификации,
 * driverStandings) называют "red_bull"/"rb". Подтверждено вживую
 * 17.09.2026 при аудите — см. полный разбор в
 * db/migrations/0003_precomputed_data.sql и backend/src/mappers/teamColors.ts.
 * Канонизируем здесь же, на входе в эту функцию, чтобы результат
 * mapConstructorStandings всегда совпадал с constructorId остальной
 * системы (team_details, driver_career, season_races и т.д.) — без этого
 * round-robin (cron/syncEntityRoundRobin.ts) заводил бы для этих двух
 * команд ВТОРУЮ, отдельную строку в constructor_career под "чужим" id.
 */
const CONSTRUCTOR_STANDINGS_ALIASES: Record<string, { id: string; name: string }> = {
  red_bull_racing: { id: "red_bull", name: "Red Bull" },
  racing_bulls: { id: "rb", name: "RB F1 Team" },
};

export function mapConstructorStandings(raw: RawConstructorStanding[], liveColors?: Map<string, string>): Standing[] {
  const leaderPoints = raw.length > 0 ? Number(raw[0].points) : 0;
  return raw.map((entry) => {
    const points = Number(entry.points);
    const alias = CONSTRUCTOR_STANDINGS_ALIASES[entry.Constructor.constructorId];
    const constructorId = alias?.id ?? entry.Constructor.constructorId;
    const constructorName = alias?.name ?? entry.Constructor.name;
    const color = liveColors?.get(constructorId) ?? constructorColor(constructorId);
    return {
      position: Number(entry.position),
      points,
      wins: Number(entry.wins),
      gapToLeader: points === leaderPoints ? 0 : leaderPoints - points,
      movement: "unknown",
      constructor: { id: constructorId, name: constructorName, color, nationality: entry.Constructor.nationality },
    };
  });
}

// Небольшой ре-экспорт, чтобы роуту не нужно было импортировать teamColors
// напрямую только ради одной функции — держим "цветовую" логику собранной
// в mappers/.
export { constructorColor };
