# Race Hub — неофициальный гоночный companion (Telegram Mini App)

Рабочее название `Race Hub` — временное, перед публичным релизом заменить на
собственный бренд без использования F1 / Formula 1 (см. ТЗ, раздел 69).

Реализовано:

**Этап 1 («Foundation»)**
- [x] Repository / структура монорепозитория
- [x] Frontend: React + TypeScript + Vite + React Router + TanStack Query
- [x] Backend: Cloudflare Worker (TypeScript) + REST API skeleton
- [x] Telegram Mini App bootstrap (WebApp.ready, theme, initData)
- [x] Telegram auth: серверная валидация initData (HMAC-SHA256)
- [x] DB: схема Cloudflare D1 (users / user_preferences / notification_settings / notification_log)

**Этап 2 («Data layer»)**
- [x] `backend/src/providers/jolpica.ts` — клиент Jolpica F1 API (retry/backoff, свой User-Agent)
- [x] `backend/src/lib/cache.ts` — TTL-кэш поверх D1 (`api_cache`) со stale-if-error фоллбэком
- [x] Нормализация `RaceWeekend`/`Session`/`Standing` — `backend/src/mappers/`
- [x] `GET /api/calendar`, `GET /api/standings/:type`, реальный `nextRace` в `/api/bootstrap`
- [x] Реальные данные в `Home`, `Calendar`, `Standings` на фронте вместо моков

Дальше по ТЗ — Этап 3 (избранные пилот/команда как отдельные экраны выбора,
уведомления, race detail `/race/:id`).

---

## Структура

```
race-hub/
├── frontend/         # Telegram Mini App (Cloudflare Pages)
│   └── src/
│       ├── telegram/ # обёртка над Telegram WebApp SDK + bootstrap flow
│       ├── api/       # http-клиент, TanStack Query client
│       ├── components/# переиспользуемые UI-компоненты
│       ├── pages/      # Home / Calendar / Standings / More / Onboarding / Splash
│       └── styles/     # CSS-переменные темы (telegram/light/dark)
│
└── backend/          # Cloudflare Worker (REST API + Telegram webhook + cron)
    └── src/
        ├── routes/     # auth, bootstrap, calendar, standings
        ├── providers/  # Jolpica F1 API client
        ├── mappers/    # raw Jolpica JSON -> нормализованные типы
        ├── services/   # calendarService (shared между /api/calendar и bootstrap)
        ├── lib/        # telegram initData validation, cache, http helpers
        └── db/          # schema.sql (D1 migrations)
```

## Frontend — запуск локально

```bash
cd frontend
npm install
npm run dev
```

Для локальной разработки Mini App внутри Telegram нужен HTTPS-туннель
(например, `cloudflared tunnel` или `ngrok`) и `Bot > Menu Button / Web App URL`,
указывающий на этот туннель.

Деплой на Cloudflare Pages:

```bash
npm run build
npx wrangler pages deploy dist --project-name=race-hub
```

## Backend — запуск локально

```bash
cd backend
npm install
npx wrangler d1 create race_hub_db          # один раз, затем вписать id в wrangler.toml
npx wrangler d1 execute race_hub_db --local --file=./src/db/schema.sql
npx wrangler dev
```

Перед деплоем задать секреты:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
```

Деплой:

```bash
npx wrangler deploy
npx wrangler d1 execute race_hub_db --remote --file=./src/db/schema.sql
```

## CI/CD (backend + frontend)

Оба воркера деплоятся отдельными workflow-файлами, каждый триггерится
только на изменения в своей папке:

- `.github/workflows/deploy-backend.yml` → Cloudflare Worker (API).
- `.github/workflows/deploy-frontend.yml` → Cloudflare Worker со статикой
  (`[assets]` в `frontend/wrangler.toml`, SPA fallback на `index.html`).

Оба используют `cloudflare/wrangler-action@v4` с `workingDirectory` на
соответствующую папку — важно для монорепо, без этого action путает
лок-файлы/пакетный менеджер фронта и бэкенда. Секрет `TELEGRAM_BOT_TOKEN`
в CI не участвует, задаётся один раз через `wrangler secret put` (или в
Cloudflare Dashboard → Worker → Settings → Variables) и переживает деплои.

Нужные секреты репозитория (Settings → Secrets and variables → Actions → **Secrets**):

| Секрет | Назначение |
|---|---|
| `CLOUDFLARE_API_TOKEN` | токен с правами `Workers Scripts:Edit` |
| `CLOUDFLARE_ACCOUNT_ID` | id аккаунта Cloudflare |

И одна repository **variable** (та же вкладка, таб **Variables**, не Secrets —
значение не секретное, просто чтобы не хардкодить в workflow):

| Variable | Значение |
|---|---|
| `VITE_API_BASE_URL` | `https://race-hub-backend.<твой-сабдомен>.workers.dev/api` |

Frontend инлайнит `VITE_API_BASE_URL` в бандл на этапе `vite build` — если
поменяется адрес backend-воркера, обновить эту variable и запушить что-то
в `frontend/**` (или запустить workflow вручную через workflow_dispatch).

## Переменные окружения backend

| Переменная | Назначение |
|---|---|
| `TELEGRAM_BOT_TOKEN` | секрет, используется для проверки подписи `initData` и для Bot API |
| `ENVIRONMENT` | `development` / `production` — влияет на строгость проверки `auth_date` |

## Data layer (Этап 2) — что важно знать

- Источник данных — [Jolpica F1 API](https://github.com/jolpica/jolpica-f1) (открытая замена Ergast). Rate limit апстрима: 4 req/sec burst, 500/hour — см. `backend/src/providers/jolpica.ts`.
- Кэш — таблица `api_cache` в D1, TTL 6ч для календаря / 15м для standings. Если апстрим недоступен, а кэш протух — отдаём протухшие данные, а не ошибку (stale-if-error).
- Country flags и цвета команд Ergast не отдаёт — они захардкожены в `backend/src/mappers/countryCode.ts` и `teamColors.ts`; при появлении новой страны/команды в календаре просто дополнить таблицу.
- Известное упрощение: `Standing.movement` (изменение позиции к прошлому этапу) всегда `"unknown"` — Ergast не отдаёт это напрямую, потребует отдельного запроса standings "на -1 раунд" (см. TODO в `mappers/standings.ts`).

## Что дальше (Этап 3, по ТЗ)

- [x] Экраны выбора избранного пилота/команды (`/drivers`, `/constructors`) + `PUT /api/preferences`
- [x] Настройки уведомлений (`/more/settings`) + `PUT /api/notifications/settings`
- [x] Cron-напоминания перед сессиями (race/qualifying/sprint/practice) через `scheduled` handler
- [x] Экран деталей гонки (`/race/:id`) — расписание + результаты квалы/гонки, когда доступны

Этап 3 закрыт. Дальше по ТЗ — result-based уведомления (см. ниже) и то, что решим следующим.

## Уведомления — что важно знать

- Cron (`[triggers] crons` в `backend/wrangler.toml`) тикает раз в 5 минут и смотрит только на ближайший незавершённый уик-энд — этого достаточно, т.к. до следующей гонки в любом случае дальше, чем максимальный `minutesBefore` (24ч).
- Идемпотентность — таблица `notification_log` с `UNIQUE(user_id, notification_key)`; повторный тик cron на ту же сессию не даст дубликат, даже если несколько инвокаций пересеклись.
- Маппинг типов сессий на 4 категории настроек: `fp1/fp2/fp3` → Practice, `sprint_quali` → Qualifying (это квалификационная сессия по формату), `sprint`/`qualifying`/`race` — сами по себе.
- Отправка — напрямую через Telegram Bot API (`backend/src/lib/telegramBot.ts`), без сторонних SDK.
- **Result-based уведомления не реализованы**: тумблеры `resultsEnabled` / `favoriteDriverResultEnabled` / `championshipChangeEnabled` в `/more/settings` сохраняются и возвращаются с бэкенда, но `sessionReminders.ts` их не читает — реально ничего не шлёт. Нужна лента результатов по сессии (теперь она есть — `services/raceDetailService.ts` — так что технически можно достроить), просто отдельная логика "сравнить с предыдущим состоянием и решить, стоит ли слать" ещё не написана.

Дисклеймер о неофициальном статусе продукта — обязателен на экране About и в
футере Home (ТЗ, раздел 70) — заглушка уже добавлена в `pages/More`.
