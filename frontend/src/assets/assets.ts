import type { SyntheticEvent } from "react";
const driverPlaceholder = "/assets/placeholders/driver.svg";
const teamPlaceholder = "/assets/placeholders/team.svg";
const carPlaceholder = "/assets/placeholders/car.svg";
const trackPlaceholder = "/assets/placeholders/track.svg";
const numberPlaceholder = "/assets/placeholders/team.svg"; // нет отдельного плейсхолдера под номер — цифра не критична для UI

/**
 * Файлы логотипов/машин лежат под "старыми" именами (rb.webp,
 * red_bull.webp) — так исторически называли константы в проекте. Но
 * реальный constructorId, который отдаёт живой Jolpica /driverstandings и
 * /constructorstandings в 2026 сезоне — "racing_bulls" и
 * "red_bull_racing" (подтверждено напрямую из прод-базы 13.09.2026, см.
 * тот же разбор в backend/src/mappers/teamColors.ts). Без этого алиаса
 * assetFor.team()/car() подставляли бы constructorId в путь буквально и
 * давали 404 на картинку для этих двух команд везде в приложении.
 */
const TEAM_ASSET_ALIASES: Record<string, string> = {
  red_bull_racing: "red_bull",
  racing_bulls: "rb",
};
function teamAssetSlug(id: string): string {
  return TEAM_ASSET_ALIASES[id] ?? id;
}

export const assetFor = {
  // liveUrl — headshotUrl из ответа API (OpenF1, см. driver_media на
  // бэкенде), когда он есть — приоритетнее локального бандла: он реальный
  // и автоматически покрывает midseason-замены в составе (не нужно
  // вручную довозить .webp на каждую замену пилота, как раньше с Цунодой).
  driver: (id?: string, liveUrl?: string | null) => liveUrl ?? (id ? `/assets/drivers/${id}.webp` : driverPlaceholder),
  // логотипы команд — растровые webp (реальные лого без прозрачного SVG-источника
  // от команд не поставляются), не .svg, как было в исходном плейсхолдере
  team: (id?: string) => (id ? `/assets/teams/${teamAssetSlug(id)}.webp` : teamPlaceholder),
  car: (id?: string) => (id ? `/assets/cars/${teamAssetSlug(id)}.webp` : carPlaceholder),
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
