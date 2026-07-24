<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Next.js 16.2.10 traps
- Use root `proxy.ts`, NOT `middleware.ts` — a `middleware.ts` file is silently ignored.
- `cookies()`, `headers()`, `params`, `searchParams` are all Promises — await them.
- Turbopack is the default bundler.
- `next lint` is removed — use `eslint` directly (see `npm run lint`).
- `revalidateTag` requires a cacheLife profile argument — prefer `revalidatePath` / `updateTag`.
- Server Actions are public POST endpoints — each one must auth-check itself, no shared gate.

## UI / validation stack
- shadcn/ui is built on @base-ui/react (style: base-nova). Compose buttons via
  `render={<Link/>}` + `nativeButton={false}` — NOT `asChild`.
- Zod is v4 — use top-level helpers like `z.email()`, `z.uuid()`.

## Money
- bigint minor units end-to-end. Only `lib/utils/money.ts` converts/formats.
- Never use `number`/float for amounts.
- JSON responses serialize bigint as strings.

## Data access
- Soft delete only (goals, contributions, checklist_items, comments, media_items,
  checkins, woop_entries): set `deletedAt`, never hard-delete. `goal_revisions` is
  the deliberate exception — append-only history that outlives its goal.
- Every child write takes `FOR UPDATE` on its **goal** row first and writes in that
  same transaction (`lib/db/queries/parent-lock.ts`). The goal row is the single
  serialization point in the whole app — never check a parent in a separate round
  trip, and never lock a comment instead of its goal.
- Anything read before the lock and acted on after it must be re-compared under the
  lock (goal currency, goal status), or it is a race by construction.
- All reads go through `lib/db/queries/*`, which centralize `deletedAt IS NULL` +
  `userId` scoping — never hand-roll these filters in pages/actions.
- Every Server Action / route handler: call `getCurrentUser()` first, zod-parse
  with `lib/validators/*` before touching the DB, and scope ownership via the
  userId-scoped queries above.
- Contributions are idempotent: client-generated uuid + `ON CONFLICT DO NOTHING`.
- Currency lock: a goal's currency is immutable once it has non-deleted
  contributions (enforced by both an action check and a DB trigger).

## Theme
- Dark mode is the `.dark` class on `<html>`, driven by the `theme` cookie.
- Token sets live in `app/globals.css` under `:root` and `.dark` — any new CSS
  var must be defined in BOTH.

## Analytics & logging
- Analytics: `lib/analytics/events.ts` exposes a typed `track()`; it logs via
  pino today — PostHog is Phase 2, not yet wired.
- Logging: `lib/log.ts` (pino, with requestId child loggers).

## docs/
- `docs/` is private and gitignored (PRD, build prompt, prototype live there
  locally) — never commit it or reference its contents in public artifacts.

## Migrations
- NEVER `drizzle-kit migrate` / `db:push` / `db:generate` — the live DB has no
  `drizzle.__drizzle_migrations` and generate crashes on a bigint default.
- Apply: `npm run db:backup`, then
  `node --env-file=.env scripts/apply-migration.mjs drizzle/00XX.sql --backup-id=<id>`.
  It runs the file and its ledger row in ONE transaction.
- Applied state lives in `public.manual_migration_ledger` (0010), never in a file
  comment. `node --env-file=.env scripts/migration-status.mjs` is the release gate.
- An applied file is immutable — its sha256 is recorded. Supersede it with a new
  migration instead of editing it.
- New tables in `public` must REVOKE from anon/authenticated and enable RLS
  explicitly (0012 fixed the schema default, but only for tables created by
  `postgres`).

## Deployment access
- `APP_ACCESS_TOKEN` (optional) turns on the token gate in `proxy.ts` / `lib/access.ts`.
  Unset = gate off, so local dev is unaffected. It is a deployment lock, not auth:
  `getCurrentUser()` still always returns the owner.

## Verification
Run before considering any change done:
```
npm run typecheck && npm run lint && npm run test && npm run build
```

## Phase discipline
MVP = PRD §9 Phase 1 only. WOOP, self-concordance, if-then forms, pace
indicator, reflections, and FX are Phase 2+ — don't build them ad hoc.
