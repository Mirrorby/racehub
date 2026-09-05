/**
 * Ergast/Jolpica отдаёт только название страны на английском (`Circuit.
 * Location.country`), без ISO alpha-2 кода — а он нужен фронту для флагов
 * (emoji flags строятся из regional indicator symbols по alpha-2 коду).
 * Покрываем страны, когда-либо принимавшие этапы календаря F1; при
 * появлении новой локации — просто дополнить таблицу.
 */
const COUNTRY_TO_ISO: Record<string, string> = {
  Australia: "AU",
  Austria: "AT",
  Azerbaijan: "AZ",
  Bahrain: "BH",
  Belgium: "BE",
  Brazil: "BR",
  Canada: "CA",
  China: "CN",
  Emilia: "IT", // Ergast: "Italy" обычно, но Imola иногда помечен отдельно
  France: "FR",
  Germany: "DE",
  Hungary: "HU",
  India: "IN",
  Italy: "IT",
  Japan: "JP",
  Malaysia: "MY",
  Mexico: "MX",
  Monaco: "MC",
  Morocco: "MA",
  Netherlands: "NL",
  Portugal: "PT",
  Qatar: "QA",
  Russia: "RU",
  "Saudi Arabia": "SA",
  Singapore: "SG",
  "South Africa": "ZA",
  "South Korea": "KR",
  Spain: "ES",
  Sweden: "SE",
  Switzerland: "CH",
  Turkey: "TR",
  UAE: "AE",
  UK: "GB",
  USA: "US",
};

export function countryNameToIsoCode(country: string): string {
  return COUNTRY_TO_ISO[country] ?? "";
}
