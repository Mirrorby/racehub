import type { RawConstructorStanding, RawDriverStanding } from "../providers/jolpica";
import type { Standing } from "../types";
import { constructorColor } from "./teamColors";

// Ergast не отдаёт изменение позиции относительно предыдущего этапа —
// потребовало бы отдельного запроса standings "на -1 раунд" и сравнения.
// Оставляем как явный TODO, а не гадаем: "unknown" честнее, чем случайная
// стрелочка на UI.
export function mapDriverStandings(raw: RawDriverStanding[]): Standing[] {
  const leaderPoints = raw.length > 0 ? Number(raw[0].points) : 0;
  return raw.map((entry) => {
    const constructor = entry.Constructors[entry.Constructors.length - 1];
    const points = Number(entry.points);
    return {
      position: Number(entry.position),
      points,
      wins: Number(entry.wins),
      gapToLeader: points === leaderPoints ? 0 : leaderPoints - points,
      movement: "unknown",
      driver: {
        id: entry.Driver.driverId,
        code: entry.Driver.code ?? entry.Driver.driverId.slice(0, 3).toUpperCase(),
        fullName: `${entry.Driver.givenName} ${entry.Driver.familyName}`,
      },
      constructor: constructor ? { id: constructor.constructorId, name: constructor.name } : undefined,
    };
  });
}

export function mapConstructorStandings(raw: RawConstructorStanding[]): Standing[] {
  const leaderPoints = raw.length > 0 ? Number(raw[0].points) : 0;
  return raw.map((entry) => {
    const points = Number(entry.points);
    return {
      position: Number(entry.position),
      points,
      wins: Number(entry.wins),
      gapToLeader: points === leaderPoints ? 0 : leaderPoints - points,
      movement: "unknown",
      constructor: { id: entry.Constructor.constructorId, name: entry.Constructor.name },
    };
  });
}

// Небольшой ре-экспорт, чтобы роуту не нужно было импортировать teamColors
// напрямую только ради одной функции — держим "цветовую" логику собранной
// в mappers/.
export { constructorColor };
