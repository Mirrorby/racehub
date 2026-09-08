# Podium Pulse — Этапы 1+2, единый пакет

Это объединённый результат обоих этапов (реальные ассеты сезона 2026 +
подключение их в код редизайна). Накладывается поверх вашей локальной
копии `Podium_Pulse_redesign_ready`, которая ещё не запушена в GitHub.

## Как применить

1. Скопируйте содержимое этого архива поверх `Podium_Pulse_redesign_ready`,
   подтверждая перезапись файлов с совпадающими путями.
2. **Удалите вручную** 5 файлов мёртвого кода (zip не умеет представлять
   удаления, а они нигде не импортировались, поэтому просто лишний вес):
   - `frontend/src/pages/Onboarding.tsx`
   - `frontend/src/pages/SelectFavorite.tsx`
   - `frontend/src/components/FavoriteButton.tsx`
   - `frontend/src/components/Skeleton.tsx`
   - `frontend/src/components/AppHeader.tsx`
3. Проверьте компиляцию перед пушем в GitHub:
   ```
   cd frontend && npm install && npm run build
   cd ../backend && npm install && npx tsc --noEmit
   ```
4. Запушите итог в `github.com/Mirrorby/racehub` (в отдельную ветку —
   вы говорили, что деплоить сразу не планируете).

## Обязательный порядок при деплое (напоминание из аудита)

Перед деплоем нового backend **сначала** прогоните на remote D1:
```
wrangler d1 execute race_hub_db --remote --file=./backend/src/db/migrations/0002_podium_pulse_preferences.sql
```
Иначе первый же запрос к preferences упадёт (`no such column`). Это не
входит в этот пакет — миграция уже была в предыдущем аудите редизайна,
файл `0002_podium_pulse_preferences.sql` у вас уже есть в
`Podium_Pulse_redesign_ready/backend/src/db/migrations/`.

## Что внутри

### Backend (3 файла)
- `types.ts`, `mappers/raceWeekend.ts` — добавлено поле `circuitId`
  (реальный баг: трасса никогда не резолвилась в файл, см. ниже)
- `mappers/teamColors.ts` — цвета команд сезона 2026

### Frontend — новое
- `components/TrackOutline.tsx` — inline-SVG трассы с анимацией импульса
- `public/assets/{teams,cars,drivers,numbers}/*.webp` — 11 команд, 11 машин,
  22 пилота, 22 номера (сезон 2026, реальные)
- `public/assets/tracks/*.svg` — 25 контуров трасс (CC BY 4.0, атрибуция
  добавлена в More.tsx)

### Frontend — изменено
- `assets.ts` — логотипы теперь `.webp`, добавлен `assetFor.number()`
- `theme/teamColors.ts`, `types/domain.ts`
- `theme/ThemeContext.tsx` — динамические surface-glass/border/nav-bg
- `i18n/I18nContext.tsx` — закрыты хардкод-строки, атрибуция трасс
- `styles/global.css` — анимация импульса, вёрстка под новые ассеты
- `pages/{Home,Calendar,RaceDetail,TrackStatistics,DriverDetail,TeamDetail,Personalization,More}.tsx`
- `components/EntityCards.tsx`

## Главные технические решения (коротко)

1. **Реальный баг найден и исправлен**: `assetFor.track(w.id)` всегда
   резолвился в `<season>-<round>.svg` — backend не отдавал `circuitId`.
   Трасса молча падала на плейсхолдер с первого дня редизайна, до этого
   пакета — никогда не работала бы, даже если бы вы сами добавили SVG.
2. **Логотипы команд обрезаны от спонсорских lockup'ов** (Mercedes, Aston
   Martin, Audi) и трейдмарк-риска (Revolut/Aramco/AMG — сторонние бренды
   вне вашего диклеймера). Williams пересобран — было лого на сплошном
   белом фоне без прозрачности.
3. **Цвета команд сэмплированы с фото болидов**, не с логотипов —
   большинство логотипов монохромные, дали бы неверный результат при
   автоматическом извлечении.
4. **Анимация трассы технически проверена**, не только написана: сделал
   статический рендер механики (pathLength-нормализация +
   stroke-dashoffset), визуально подтвердил, что импульс идёт по контуру
   и форма трассы (Монца/Монако) узнаваема.
5. `tsc -b --noEmit` + `vite build` (frontend) и `tsc --noEmit` (backend) —
   всё чисто на момент сборки этого пакета.

## Что нужно проверить вам после деплоя (не смог сам — нет доступа к
живому приложению из песочницы)

| # | Что | Где |
|---|---|---|
| 1 | Направление импульса на каждой из 25 трасс (сейчас везде default, не reverse) | `REVERSE_DIRECTION` в `TrackOutline.tsx` |
| 2 | Визуальный баланс графики номера пилота на карточках | `pp-driver-card__number-graphic`, `pp-choice__number-graphic` в `global.css` |
| 3 | circuitId для `madring` (Мадрид) — не подтверждён живым запросом | `docs/CIRCUIT_MAPPING.md` в этом пакете |
| 4 | Актуальность Бахрейна/Джидды в календаре 2026 | там же |

## Не входит в этот пакет (следующий этап — backend)

Practice/Sprint результаты сессий и данные для Track Statistics/Career —
отдельная работа с backend-мапперами и, для части полей, курируемым
датасетом. Готовы перейти к этому дальше.
