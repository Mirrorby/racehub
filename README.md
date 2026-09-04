# Race Hub — неофициальный гоночный companion (Telegram Mini App)

Рабочее название `Race Hub` — временное, перед публичным релизом заменить на
собственный бренд без использования F1 / Formula 1 (см. ТЗ, раздел 69).

Реализация Этапа 1 («Foundation») из ТЗ:

- [x] Repository / структура монорепозитория
- [x] Frontend: React + TypeScript + Vite + React Router + TanStack Query
- [x] Backend: Cloudflare Worker (TypeScript) + REST API skeleton
- [x] Telegram Mini App bootstrap (WebApp.ready, theme, initData)
- [x] Telegram auth: серверная валидация initData (HMAC-SHA256)
- [x] DB: схема Cloudflare D1 (users / user_preferences / notification_settings / notification_log)

Дальше по этапам ТЗ (Этап 2 — Data layer: Jolpica provider, нормализация,
кэш, calendar/standings/results) — см. `backend/src/routes` и TODO в коде.

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
        ├── routes/     # auth, bootstrap, ...
        ├── lib/        # telegram initData validation, cache helpers
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

## Переменные окружения backend

| Переменная | Назначение |
|---|---|
| `TELEGRAM_BOT_TOKEN` | секрет, используется для проверки подписи `initData` и для Bot API |
| `ENVIRONMENT` | `development` / `production` — влияет на строгость проверки `auth_date` |

## Что дальше (Этап 2, по ТЗ)

1. `backend/src/providers/jolpica.ts` — клиент Jolpica F1 API с retry/backoff и своим User-Agent.
2. `backend/src/lib/cache.ts` — cache-слой поверх KV/D1 с TTL из ТЗ (раздел 9) и single-flight refresh.
3. Нормализация сущностей (`Driver`, `Constructor`, `RaceWeekend`, `Standing`) — типы уже заведены в `backend/src/types.ts`, осталось написать мапперы.
4. Реальные данные в `Home`, `Calendar`, `Standings` на фронте вместо моков.

Дисклеймер о неофициальном статусе продукта — обязателен на экране About и в
футере Home (ТЗ, раздел 70) — заглушка уже добавлена в `pages/More`.
