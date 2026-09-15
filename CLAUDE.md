# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

"Săn Vé" — a personal (≤ 10 users, non-commercial, zero-cost) Next.js web app + PWA that watches flight prices, mostly Vietnamese domestic routes, and notifies via Web Push + Telegram when a deal appears.

**`docs/plan/ke-hoach-san-ve.md` is the source of truth** for scope, decisions and the roadmap (Vietnamese). Read the relevant section before building a feature, and update its status and "Quyết định đã chốt" when a decision changes. Phase 0 (provider spike) and Phase 1 (foundation) are done; Phase 2 (MVP) starts with "vertical slice #0".

UI text and docs are Vietnamese; code, identifiers and comments are English. The dev machine is Windows (PowerShell).

## Commands

```powershell
npm run dev                  # Turbopack dev server
npm run build                # production build (also type-checks)
npm run lint
npm run typecheck            # next typegen && tsc --noEmit — typegen generates LayoutProps/RouteContext types
npm test                     # vitest run (src/**/*.test.ts)
npx vitest run src/lib/env.test.ts          # one file
npx vitest run -t "normalizes the email"    # one test by name

npm run db:generate          # schema.ts → new SQL migration in drizzle/
npm run db:migrate           # apply migrations (DATABASE_URL from .env.local)
npm run db:seed:airports     # idempotent upsert of 42 airports
npm run db:check             # read-only sanity check of the DB
npm run spike                # re-run the Travelpayouts spike (needs spike/.env)
```

CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → migrate + seed against a Postgres 17 service → build.

## Environment

- Secrets live in `.env.local` (root) and `spike/.env`; both are gitignored. `.env.example` files are committed and must stay free of values.
- `src/lib/env.ts` validates with zod **lazily** via `env()` — never read env at module top level, so `next build` works without secrets. Phase 2 variables are declared optional; make them required only when their feature lands.
- Scripts under `scripts/` run with `tsx --env-file=.env.local`; `drizzle.config.ts` calls `process.loadEnvFile('.env.local')` itself.

## Database

- One driver everywhere: `postgres` (postgres-js) over TCP with `prepare: false` (Neon pooled connection runs PgBouncer). Access through `db()` from `src/lib/db`; scripts must `await closeDb()` at the end.
- Workflow: edit `src/lib/db/schema.ts` → `npm run db:generate` → review the SQL → commit the migration. Anything drizzle-kit cannot express (extensions, functions) goes in a custom migration (`npx drizzle-kit generate --custom --name=…`).
- Column names are given explicitly in snake_case, except the Auth.js adapter columns on `users` (`emailVerified`, …) which must keep the adapter's names.
- Accent-insensitive search: store a pre-normalized `search_text` computed with `normalizeSearch()` (`src/lib/utils/text.ts`) and index it with a `pg_trgm` GIN index. Postgres `unaccent()` is not IMMUTABLE, so it cannot back an index.
- Production DB is Neon (Postgres 18, us-east-2); deploy Vercel functions in `iad1` to stay close.

## Architecture (planned; see plan §1, §3–§7)

The background pipeline is triggered by cron-job.org → `POST /api/cron/scan`, which returns 202 at once and does the work in `after()`:
scheduler (leases due `scan_tasks`) → scanner (provider → `price_snapshots`) → deal detector (score + 5 anti-spam gates → `alert_events`) → dispatcher (Web Push, Telegram fallback). A daily `/api/cron/rollup` computes `route_stats` baselines and prunes data.

Invariants that span several files and are easy to break:
- **Scan unit = route × departure month** (1 adult, economy). Watches are only filters on snapshots and link to tasks N-N via `watch_scan_tasks`.
- **Lease is a single `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING`** with a `lease_id` check on completion. Do not split it into SELECT + UPDATE.
- **`observation_key` = the provider's `found_at`**; the unique key `(scan_task_id, depart_date, observation_key)` stops cached prices from becoming duplicate samples. Relative rules need `sample_count ≥ 8`.
- **Deal "episodes"** reset the Improvement gate and the dedupe key once the price rebounds ≥ 10% or 7 days pass. Without this, a watch can never alert again.
- Provider code stays isolated in `src/lib/providers/<name>/`; everything else depends only on domain types, and `MockProvider` must keep the app usable without a real provider.

## Provider: Travelpayouts (the only one)

The spike (`spike/`, results in `spike/results/*.json`, gitignored) showed that `getCheapestByMonth` needs two calls merged by date:
- `/v2/prices/month-matrix` gives day coverage plus `found_at`.
- `/aviasales/v3/prices_for_dates` gives `airline`, `link` (deeplink) and `departure_at` (local time with offset; the first 10 chars are the local date).

Both return VND when called with `currency=vnd`. Prices are cached, not realtime, and ~17–35 h old. Amadeus Self-Service (shut down July 2026) and Duffel (business-only) are ruled out. Use the spike JSON as the source for mapper test fixtures.

## Next.js 16 specifics

- Before writing Next code, check `node_modules/next/dist/docs/` (see AGENTS.md): APIs differ from older versions.
- Route protection lives in `proxy.ts` (formerly `middleware.ts`); do real authorization checks in handlers and server components.
- Force request-time execution in a route handler with `await connection()` from `next/server`.
- `@serwist/next` needs webpack (`next build --webpack`) or `@serwist/turbopack`, because Turbopack is the default.

## `spike/` is a separate mini-project

`spike/` holds plain Node scripts run with Node's built-in type stripping (Node ≥ 22.18), so:
- imports use explicit `.ts` extensions;
- use `import type`, and no enums or other non-erasable syntax;
- it has its own `package.json` (`"type": "module"`) and `tsconfig.json`, and is excluded from the root tsconfig.

Type-check it with `npx tsc -p spike/tsconfig.json`. Do not import app code from it or vice versa.
