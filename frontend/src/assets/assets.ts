import type { SyntheticEvent } from "react";
const driverPlaceholder = "/assets/placeholders/driver.svg";
const teamPlaceholder = "/assets/placeholders/team.svg";
const carPlaceholder = "/assets/placeholders/car.svg";
const trackPlaceholder = "/assets/placeholders/track.svg";
const numberPlaceholder = "/assets/placeholders/team.svg"; // нет отдельного плейсхолдера под номер — цифра не критична для UI

export const assetFor = {
  driver: (id?: string) => (id ? `/assets/drivers/${id}.webp` : driverPlaceholder),
  // логотипы команд — растровые webp (реальные лого без прозрачного SVG-источника
  // от команд не поставляются), не .svg, как было в исходном плейсхолдере
  team: (id?: string) => (id ? `/assets/teams/${id}.webp` : teamPlaceholder),
  car: (id?: string) => (id ? `/assets/cars/${id}.webp` : carPlaceholder),
  // номер пилота — белая вырезанная цифра на прозрачном фоне, привязана к driverId,
  // а не constructorId (у каждого пилота свой номер)
  number: (driverId?: string) => (driverId ? `/assets/numbers/${driverId}.webp` : numberPlaceholder),
  // контур трассы — теперь inline-ready SVG с currentColor и viewBox,
  // подключается через track(circuitId) + fetch/inline, а не как <img src>,
  // иначе анимация импульса по трассе (см. ТЗ редизайна, 8.1) невозможна.
  track: (id?: string) => (id ? `/assets/tracks/${id}.svg` : trackPlaceholder),
};

export function imageFallback(event: SyntheticEvent<HTMLImageElement>, fallback: string) {
  const image = event.currentTarget;
  if (!image.src.endsWith(fallback)) image.src = fallback;
}

export const placeholders = { driverPlaceholder, teamPlaceholder, carPlaceholder, trackPlaceholder, numberPlaceholder };
