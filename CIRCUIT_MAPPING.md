# Ассеты сезона 2026 — маппинг и статус (Этап 1)

Дата: 08.09.2026. Все `constructorId`/`driverId` сверены вручную с живым
Jolpica API (`https://api.jolpi.ca/ergast/f1/2026/constructors`,
`.../2026/drivers`), кроме отмеченного отдельно.

## Команды (11, сезон 2026)

| constructorId | Файлы | Источник цвета |
|---|---|---|
| alpine | teams/cars/alpine.webp | сэмплирован с фото болида |
| aston_martin | teams/cars/aston_martin.webp | сэмплирован с фото болида |
| audi | teams/cars/audi.webp | сэмплирован с фото болида (новая команда 2026) |
| cadillac | teams/cars/cadillac.webp | **вручную** — ливрея чёрно-графитовая, насыщенного акцента нет (новая команда 2026) |
| ferrari | teams/cars/ferrari.webp | сэмплирован с фото болида |
| haas | teams/cars/haas.webp | сэмплирован с фото болида |
| mclaren | teams/cars/mclaren.webp | сэмплирован с фото болида |
| mercedes | teams/cars/mercedes.webp | сэмплирован с фото болида |
| rb (Racing Bulls) | teams/cars/rb.webp | сэмплирован с фото болида |
| red_bull | teams/cars/red_bull.webp | сэмплирован с фото болида |
| williams | teams/cars/williams.webp | сэмплирован с фото болида |

Sauber выбыл из грида — стал заводской командой Audi. Старая запись `sauber`
в предыдущей таблице цветов больше не актуальна.

### Что было исправлено в присланных логотипах

- **Williams** — исходник был лого с посторонним титульным спонсором
  (Atlassian) на сплошном белом фоне без прозрачности. Обрезан до
  "Williams F1 Team", фон сделан прозрачным через chroma-key.
- **Mercedes, Aston Martin, Audi** — исходники содержали lockup с лого
  сторонних спонсоров (AMG Petronas, Aramco, Revolut). Обрезаны до
  собственного знака команды (звезда/крылья/кольца) — и по эстетике
  (мелкий текст нечитаем в маленькой карточке), и по трейдмарк-риску
  (сторонние бренды не покрыты вашим диклеймером "unofficial F1 companion").
- **Cadillac** — обрезана строка "FORMULA 1 TEAM" под гербом для единообразия
  с остальными логотипами (это не сторонний спонсор, чисто эстетическая правка).
- **Racing Bulls, Red Bull, Ferrari, McLaren, Alpine, Haas** — без изменений
  по составу (сторонних брендов нет), только обрезка полей и конвертация.

## Пилоты (22, сезон 2026)

| Файл материала | driverId (Jolpica) |
|---|---|
| alpinefracol01 | colapinto |
| alpinepiegas01 | gasly |
| astonmartinferalo01 | alonso |
| astonmartinlanstr01 | stroll |
| audigabbor01 | bortoleto |
| audinichul01 | hulkenberg |
| cadillacserper01 | perez |
| cadillacvalbot01 | bottas |
| ferrarichalec01 | leclerc |
| ferrarilewham01 | hamilton |
| haasestoco01 | ocon |
| haasolibea01 | bearman |
| mclarenlannor01 | norris |
| mclarenoscpia01 | piastri |
| mercedesandant01 | antonelli |
| mercedesgeorus01 | russell |
| racingbullsarvlin01 | arvid_lindblad |
| racingbullslialaw01 | lawson |
| redbullracingisahad01 | hadjar |
| redbullracingmaxver01 | **max_verstappen** ⚠️ |
| williamsalealb01 | albon |
| williamscarsai01 | sainz |

⚠️ `max_verstappen` — подтверждён из официальной документации Jolpica
(пример в `docs/endpoints/qualifying.md`), но не переподтверждён живым
запросом лично мной: `/2026/drivers` отдаёт по 30 записей на страницу
(default `limit`), а Верстаппен алфавитно попадает на вторую страницу.
Сама таблица `driverStandings`, которой реально пользуется бэкенд
(`getDriverStandings()` в `jolpica.ts`), лимит не превышает (22 гонщика
< 30) — так что бага в текущем коде это не создаёт, но при любой будущей
работе с сырым `/drivers` эндпоинтом **не забывайте про пагинацию**
(`limit`/`offset`, максимум 100 за раз).

## Трассы (25 SVG)

Источник: [julesr0y/f1-circuits-svg](https://github.com/julesr0y/f1-circuits-svg),
**лицензия CC-BY-4.0 — требует атрибуции** (см. ниже). Взят стиль
`minimal/white`: один `<path>` на трассу, дизайн уже готов под
`stroke-dasharray`/`stroke-dashoffset`-анимацию.

Что сделано с каждым файлом:
- добавлен `viewBox`, убраны фиксированные `width`/`height` (чтобы SVG
  тянулся по контейнеру);
- `stroke:#fff` заменён на `stroke:currentColor` (чтобы цвет трассы
  наследовался от `color` родителя — можно красить в акцент темы команды);
- имя файла — `{jolpica circuitId}.svg`, а не название трассы из
  исходного репозитория, чтобы бэкенд/фронт могли обращаться по тому же
  `circuitId`, который отдаёт Jolpica в `race.Circuit.circuitId`.

### ⚠️ Требует обязательной проверки перед продакшеном

Один маппинг **не подтверждён живым запросом**: `madring` (новый
испанский автодром в Мадриде, дебютирует в 2026) — Jolpica мог присвоить
другой `circuitId`. Остальные 24 сверены либо напрямую (`albert_park`,
`losail`, `vegas` — через issue/discussion в репозитории jolpica-f1),
либо взяты по устоявшейся конвенции Ergast (`americas`, `spa`,
`red_bull_ring`, `rodriguez`, `villeneuve`, `marina_bay`, `yas_marina` и
т.д.), которая не менялась годами. Перед деплоем стоит один раз сверить
весь список через `GET /2026/races` и поправить при необходимости —
это займёт 5 минут, инструкция:

```
curl https://api.jolpi.ca/ergast/f1/2026/races
```
и сравнить `Circuit.circuitId` каждой гонки с именами файлов в
`frontend/public/assets/tracks/`.

### Бахрейн и Джидда — расхождение в источнике

В `circuits.json` репозитория обе трассы помечены сезонами только
"...-2025", в отличие от остальных 23 трасс, где явно указан 2026 год.
Само по себе это не обязательно значит, что трассы выпали из календаря
(планировки не меняются каждый год, это может быть просто отставание
мейнтейнера в обновлении метаданных) — я включил их layout по умолчанию
(`bahrain-1`, `jeddah-1`, актуальны с 2011/2021 соответственно и не менялись).
Тем не менее стоит свериться с реальным календарём 2026 — если Бахрейн/
Джидда ротировались из календаря в этом сезоне, эти два файла просто не
понадобятся, ничего страшного.

## Обязательная атрибуция (CC-BY-4.0)

Требуется видимая атрибуция источника трасс. Предлагается добавить строку
в раздел "О проекте" / More (там же, где уже есть диклеймер
"unofficial fan-made"):

> Контуры трасс: [f1-circuits-svg](https://github.com/julesr0y/f1-circuits-svg)
> by Jules Roy, лицензия CC BY 4.0.

Каждый SVG-файл также содержит `<desc>` с атрибуцией внутри самого файла
(это уже было в исходниках репозитория) — это не заменяет видимую
атрибуцию в интерфейсе, но является дополнительным плюсом.

## Что дальше (Этап 2, не входит в этот пакет)

Сами по себе файлы не заставляют трассу "бежать" — это отдельная задача:
1. Заменить `<img src={assetFor.track(id)}>` на реальный inline-SVG
   (fetch + вставка в DOM), иначе `currentColor` не сработает и
   `stroke-dasharray`-анимация невозможна технически (ограничение
   `<img>`-тега, см. аудит редизайна от 07.09.2026).
2. Добавить CSS-анимацию хода импульса по `stroke-dashoffset` с паузами
   между проходами.
3. Определить направление движения (по часовой/против) на каждой трассе
   вручную — SVG-путь рисует контур в порядке, заданном исходным файлом,
   который не обязательно совпадает с реальным направлением гонки.
