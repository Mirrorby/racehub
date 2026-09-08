# Podium Pulse redesign audit

## Existing architecture

- Frontend: React 18, TypeScript, Vite, React Router and TanStack Query.
- Backend: Cloudflare Worker, itty-router, Cloudflare D1 and scheduled notification jobs.
- Authentication: Telegram `initData` is verified by the backend and exchanged for a server session.
- Data: Jolpica supplies calendar, standings and official race/qualifying results; OpenF1 is the fast path for recent live results.
- Persistence: D1 stores users, preferences, notification settings, sessions and API cache.

## Reused without replacement

- Telegram authentication and WebApp bootstrap.
- All existing backend providers, retry/cache behaviour and notification settings.
- Calendar, standings, race-detail and preferences API routes.
- React Query cache and hooks.
- Existing race/session/result domain model.

## Minimal contract changes

- Preferences now support a second independent driver and `en`/`ru` language.
- Standings expose fields already returned by Jolpica (number, team, team colour and nationality) so the redesigned cards do not need mocked data.
- Existing preference fields remain compatible.

## Architectural conflicts and fallbacks

- The current data sources do not provide complete career profiles, detailed track characteristics, tyre compounds, turn/sector geometry or all session result types. These areas render local unavailable states instead of invented values.
- Accurate portraits, cars, logos and circuit SVGs were not supplied. Neutral placeholder files and stable per-entity asset paths are included under `frontend/public/assets`; replacing files later requires no layout changes.
- Team colours use the existing constructor-colour mapper until final logo assets are supplied. Theme tokens are still generated through one shared theme provider.

## Deployment note

For an existing D1 database, run `npm run db:migrate:podium:remote` in `backend` once before deploying the updated Worker. A new database can use `src/db/schema.sql` directly.
