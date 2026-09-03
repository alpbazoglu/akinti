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

## Environment variables

Copy `.env.example` to `.env.local` and fill in the three values from your
Supabase project's API settings:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

The service role key is required for `npm run worker` (`scripts/worker.ts`)
and must never reach the browser — see `../docs/SECURITY.md`.
