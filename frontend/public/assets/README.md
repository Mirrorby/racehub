# Podium Pulse assets — сезон 2026

Соглашение об именах (см. `docs/ASSET_MAPPING.md` в корне репозитория для
полной таблицы соответствий):

- `teams/<constructorId>.webp` — знак команды, прозрачный фон
- `cars/<constructorId>.webp` — болид сбоку, прозрачный фон
- `drivers/<driverId>.webp` — портрет пилота в полный рост, прозрачный фон
- `numbers/<driverId>.webp` — белая цифра номера пилота, прозрачный фон
  (номер привязан к пилоту, не к команде)
- `tracks/<circuitId>.svg` — контур трассы, один `<path>`, `stroke:currentColor`,
  готов под inline-вставку и stroke-dasharray анимацию. **Не использовать
  через `<img src>`** — `currentColor` и анимация тогда не работают.
  `circuitId` — тот же, что отдаёт Jolpica в `race.Circuit.circuitId`.

`constructorId`/`driverId` — значения из Jolpica/Ergast API
(`https://api.jolpi.ca/ergast/f1/2026/...`), не придуманные произвольно.

Нейтральные файлы в `placeholders/` используются автоматически, когда
конкретный asset отсутствует.

## Лицензия трасс

Контуры трасс в `tracks/` взяты из
[julesr0y/f1-circuits-svg](https://github.com/julesr0y/f1-circuits-svg)
(CC BY 4.0). Требуется видимая атрибуция в интерфейсе приложения
(предложение — в разделе "О проекте"/More), не только в исходниках.
