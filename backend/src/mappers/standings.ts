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
export function mapDriverStandings(raw: RawDriverStanding[], liveColors?: Map<string, string>): Standing[] {
  const leaderPoints = raw.length > 0 ? Number(raw[0].points) : 0;
  return raw.map((entry) => {
    const constructor = entry.Constructors[entry.Constructors.length - 1];
    const points = Number(entry.points);
    const constructorId = constructor?.constructorId ?? "";
    const color = liveColors?.get(constructorId) ?? constructorColor(constructorId);
    return {
      position: Number(entry.position),
      points,
      wins: Number(entry.wins),
      gapToLeader: points === leaderPoints ? 0 : leaderPoints - points,
      movement: "unknown",
      driver: {
        id: entry.Driver.driverId,
        code: entry.Driver.code ?? entry.Driver.driverId.slice(0, 3).toUpperCase(),
        number: entry.Driver.permanentNumber ? Number(entry.Driver.permanentNumber) : null,
        fullName: `${entry.Driver.givenName} ${entry.Driver.familyName}`,
        constructorId,
        constructorName: constructor?.name ?? "",
        teamColor: color,
      },
      constructor: constructor ? { id: constructorId, name: constructor.name, color, nationality: constructor.nationality } : undefined,
    };
  });
}

export function mapConstructorStandings(raw: RawConstructorStanding[], liveColors?: Map<string, string>): Standing[] {
  const leaderPoints = raw.length > 0 ? Number(raw[0].points) : 0;
  return raw.map((entry) => {
    const points = Number(entry.points);
    const constructorId = entry.Constructor.constructorId;
    const color = liveColors?.get(constructorId) ?? constructorColor(constructorId);
    return {
      position: Number(entry.position),
      points,
      wins: Number(entry.wins),
      gapToLeader: points === leaderPoints ? 0 : leaderPoints - points,
      movement: "unknown",
      constructor: { id: constructorId, name: entry.Constructor.name, color, nationality: entry.Constructor.nationality },
    };
  });
}

// Небольшой ре-экспорт, чтобы роуту не нужно было импортировать teamColors
// напрямую только ради одной функции — держим "цветовую" логику собранной
// в mappers/.
export { constructorColor };
