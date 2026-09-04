# AKINTI — Supabase project

Schema map and design decisions: `../docs/DATABASE.md`,
`../docs/SECURITY.md`, `../docs/AUDIO_ARCHITECTURE.md`. This file is just
"how to apply it."

## Layout

```
supabase/
  config.toml           Local Supabase CLI config (ports, auth, storage limits)
  migrations/*.sql       17 timestamped migrations, apply in filename order
  migrations/down/*.sql  One rollback file per migration, apply in REVERSE order
  seed.sql               Dev-only seed data (see the banner at its top)
```

## Applying migrations

**Docker is not available in this development environment** — these
migrations have been validated by careful manual review against the spec,
not by running `supabase start`/`db reset` locally. Apply them to a real
project (a free-tier Supabase project is enough) before relying on this
schema, and re-run the scenarios in `../docs/TESTING.md`.

### Option A — Supabase CLI, against a hosted project

```
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

`db push` applies every migration under `migrations/` in filename order —
they're timestamped so that order is unambiguous. It does **not** run
`seed.sql` against a linked remote project; see below.

### Option B — Supabase CLI, local (once Docker is available)

```
supabase start
supabase db reset
```

`db reset` applies all migrations and then runs `seed.sql` automatically
(`[db.seed] sql_paths = ["./seed.sql"]` in `config.toml`).

### Option C — SQL editor (no CLI)

Open the Supabase Studio SQL editor for your project and paste/run each file
in `migrations/` **in filename order** (`20260903120100_...` through
`20260903121700_...`). Do not skip a file — several later migrations close a
circular foreign key or add a trigger that an earlier migration's comments
call out explicitly (e.g. migration 06 adds the `waves.duet_request_id` FK
that migration 04 leaves pending).

### Option D — `scripts/apply-migrations.ts` (plain `pg`, no CLI/Docker)

A dependency-light alternative to `supabase db push` for hosts where the
CLI's Docker-based diffing isn't wanted, or CI. Uses the `pg` package
directly and needs only `DATABASE_URL`/`SUPABASE_DB_URL` — see
"Environment variables" below for where to get it.

```bash
npm run db:migrate:dry   # list pending migrations; no DB connection required
npm run db:migrate       # apply every pending migration, one transaction per file
npm run db:seed          # apply migrations, then run seed.sql (refuses if NODE_ENV=production)
```

It tracks what's already applied in `public.schema_migrations(name, applied_at)`
so re-running is safe — already-applied files print `skipped`, new ones print
`applied`, and the first failure prints `FAILED <name>: <error message + position>`
and stops with a non-zero exit code (no partial file is ever left half-applied,
since each file runs inside its own transaction).

Roll a single migration back with:

```bash
npx tsx scripts/apply-migrations.ts --down <migration-name>
```

This runs the matching `migrations/down/<migration-name>_down.sql` and
deletes its `schema_migrations` tracking row. Same ordering caveats as
"Rolling back" below apply — this only runs one file, it does not sequence
the whole reverse chain for you.

## Seed data (`seed.sql`) — development only

**Never run this against staging or production.** It creates three fake
accounts (password `akinti-dev-1234`: `akin@example.test`,
`maria@example.test`, `alex@example.test`), fake `audio_assets` rows
pointing at storage keys that **do not exist**, and a full social graph
(follows, an accepted Duet, comments, saves, shares, deduplicated listens).
Audio will not actually play until you upload real files to those storage
keys — that's intentional; nothing in this codebase fakes working
functionality. To seed manually against a project the CLI already applied
migrations to:

```
psql "$DATABASE_URL" -f supabase/seed.sql
```

or, equivalently, `npm run db:seed` (see Option D above) — it refuses to run
when `NODE_ENV=production`.

## Rolling back

Rollbacks are per-migration and must be run in the **reverse** of the apply
order (drop dependents before the things they depend on). Some, notably
`down/20260903121200_row_level_security_down.sql`, are explicitly marked
local-development-only in their header comment — they leave every table
readable/writable by anyone holding an anon key, which is never acceptable
against real data. Read each `down/*.sql` file's header before running it;
several call out an ordering requirement (e.g. drop RLS policies before
dropping the predicate functions they call).

## Storage buckets

Two buckets are created by migration 13, not manually in the dashboard:

- `audio` — private, 100MB limit, the audio MIME allowlist from
  `src/lib/supabase/config.ts`.
- `avatars` — public, 2MB limit, common image types.

If you ever need to recreate them by hand (e.g. after a partial reset),
re-run migration 13 rather than clicking through the dashboard — the object
policies it creates are load-bearing (see `../docs/SECURITY.md`).
`scripts/verify-live.ts` (`npm run verify:live`) checks both buckets exist
with the right `public`/limit settings over the Storage API, and can create
either one if missing:

```bash
npm run verify:live                     # check only
npx tsx scripts/verify-live.ts --create-buckets   # create audio/avatars if missing
```

It also confirms `profiles`, `waves`, `audio_assets`, `notifications` and
`messages` are reachable and that the `can_view_wave`/`rising_creators` RPCs
are callable, printing a pass/fail table and exiting non-zero on any
failure.

## Environment variables

Copy `.env.example` to `.env.local` and fill in the three values from your
Supabase project's API settings:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

The service role key is required for `npm run worker` (`scripts/worker.ts`)
and for `npm run verify:live`, and must never reach the browser — see
`../docs/SECURITY.md`.

### `DATABASE_URL` (for `scripts/apply-migrations.ts` only)

Not one of the three app env vars above — only needed if you're using
`npm run db:migrate`/`db:migrate:dry`/`db:seed` instead of the CLI. Get it
from the Supabase dashboard: **Project Settings → Database → Connection
string**, tab **URI**. Two forms are offered:

- **Session pooler** (`postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`)
  — **recommended if your network is IPv4-only** (most laptops/CI runners),
  since the pooler is reachable over IPv4 while Supabase's direct connection
  is IPv6-only unless you've paid for the IPv4 add-on.
- **Direct connection** (`postgres://postgres:<password>@db.<ref>.supabase.co:5432/postgres`)
  — use this if your network has IPv6 egress or the IPv4 add-on is enabled.

Either form works as-is with `scripts/apply-migrations.ts` — paste the full
URI (with your database password filled in) into `.env.local`:

```
DATABASE_URL=postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

`SUPABASE_DB_URL` is accepted as an alias if you already use that name
elsewhere. The script connects with `ssl: { rejectUnauthorized: false }` —
Supabase's certificate isn't in Node's default trust store, so the channel
is still encrypted but the full chain isn't verified; see the comment at the
top of `scripts/apply-migrations.ts` for the reasoning.
