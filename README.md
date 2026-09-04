# AKINTI

AKINTI is an audio-first social network. Users share voice, music and spoken
audio ("Waves"), discover creators, and collaborate through **Duets** —
recording a synchronized response against someone else's Wave. There are no
Likes, no photo/video feed, and no faked functionality anywhere in this
codebase: a feature that isn't real (a missing backend, a job still
processing, an unconfigured Supabase project) always shows an honest
loading/empty/error state instead of pretending to work.

Product source of truth: `../akın icin md.md` (the master spec), summarized
in [`docs/PRODUCT.md`](docs/PRODUCT.md).

## Stack

Next.js 16 (App Router) + TypeScript + React 19 + Tailwind CSS 4, backed by
Supabase (Postgres, Auth, Storage, Realtime). Audio processing (normalize/
enhance, waveform peaks, Duet mixdown) runs in a standalone Node worker
(`scripts/worker.ts`, ffmpeg) reading a Postgres-backed job queue — not a
Vercel serverless function, which has execution-time limits unsuitable for
audio processing. Full rationale: [`docs/AUDIO_ARCHITECTURE.md`](docs/AUDIO_ARCHITECTURE.md).

## Quick start

Requires Node `>=20.9.0` (`.nvmrc` pins **22**; `nvm use` if you have nvm).

```bash
npm install
cp .env.example .env.local   # fill in the three Supabase values below
npm run check-env            # sanity-check .env.local before starting anything
```

**1. Set up Supabase.** Create a project (a free tier is enough), then apply
every file under `supabase/migrations/` in filename order — either
`supabase db push` (CLI, against a linked hosted project) or paste each file
into the Studio SQL editor in order. Full walkthrough, including the two
storage buckets and realtime setup: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
Local `supabase start`/`db reset` also works once Docker is available in
your environment — see [`supabase/README.md`](supabase/README.md).

**2. Fill in `.env.local`:**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

All three come from the Supabase project's API settings. Without them the
app still runs and builds — it degrades to an honest "backend not
configured" state everywhere (see `src/lib/supabase/config.ts`) rather than
crashing — but nothing that touches the database or storage will work.

**3. Run the web app:**

```bash
npm run dev            # http://localhost:3000
```

**4. Run the audio worker** (needed for Waves to actually process — without
it, uploads stay in `pending`/`processing` and play back only the
unenhanced original file):

```bash
npm run worker          # loops forever, polling every 5s
npm run worker:once     # drains the queue once and exits
```

Requires a system `ffmpeg` + `ffprobe` on `PATH` locally. No fallback exists
on purpose — a missing binary fails every claimed job loudly rather than
faking success. To run the worker in a container instead (with ffmpeg
already installed), see `Dockerfile.worker` / `docker-compose.worker.yml`
and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#worker-deployment).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the Next.js dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Unit tests (Vitest), once |
| `npm run test:watch` | Unit tests, watch mode |
| `npm run e2e` | Playwright e2e — backend-dependent specs are excluded unless `E2E_SUPABASE=1` (see Testing below) |
| `npm run worker` | Run the audio processing worker (loops forever) |
| `npm run worker:once` | Drain the job queue once and exit |
| `npm run check-env` | Validate required env vars for the **web** app |
| `npm run check-env:worker` | Validate required env vars for the **worker** (adds `SUPABASE_SERVICE_ROLE_KEY`) |
| `npm run verify` | `typecheck && lint && test && build`, in order — what CI runs |

## Project layout

```
src/app/**            Routes, layouts, Server Components/Actions (App Router)
src/components/**      Presentational + client components, incl. the UI kit (src/components/ui)
src/lib/audio/**       Recording, playback, waveform decode — client audio infrastructure
src/lib/db/**          Typed Supabase query helpers, one file per domain area
src/lib/validation/**  Zod input schemas
src/lib/auth/**        Auth domain API (server reads/redirects, client provider)
src/lib/supabase/**    Supabase client factories + storage/config constants
src/config/**          Brand/terminology, typed route builders
src/proxy.ts           Session refresh + route protection matrix (spec §32 — a UX
                       convenience only; real authorization is Postgres RLS)
src/instrumentation.ts Boot-time env validation (see scripts/check-env.ts)
src/types/**           Hand-written Database type + app-level domain types
scripts/worker.ts      Standalone audio processing worker (ffmpeg)
scripts/check-env.ts   Env var validation, shared by the app boot, the CLI, and Dockerfile.worker
supabase/**            Migrations, seed data, storage/RLS policy — see supabase/README.md
e2e/**                 Playwright specs
docs/**                Architecture and process documentation (index below)
```

`src/lib/db/**` never imports a Supabase client itself — every helper takes
one as its first argument — so the same query helpers work from a Server
Component, a Server Action, a Route Handler, and the worker (via the admin
client) without guessing which auth context they're in. Full architecture:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Docs index

| Doc | Covers |
|---|---|
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | What AKINTI is, founder decisions, non-negotiable product principles |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Module layout, ownership, data flow, Next 16 specifics |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Schema map, migration list, entity relationships |
| [`docs/AUDIO_ARCHITECTURE.md`](docs/AUDIO_ARCHITECTURE.md) | The audio pipeline, job queue, signed URLs, client capture |
| [`docs/DUET_SPEC.md`](docs/DUET_SPEC.md) | Duet request lifecycle, sync, mixdown |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Auth, authorization model, RLS, storage security, secrets |
| [`docs/TESTING.md`](docs/TESTING.md) | Test matrix, what's automated vs. what still needs a real Supabase project |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Vercel + Supabase + worker deployment, post-deploy checklist, rollback |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | Runbooks: stuck jobs, expired Duet requests, storage cleanup, key rotation, backups, incident response |

## Testing

Vitest for unit tests, Playwright for e2e (spec §30/§46). `npm test` and
`npm run typecheck`/`npm run lint` need no backend and run the same in CI as
locally. Two Playwright specs (`e2e/auth.spec.ts`, `e2e/duet.spec.ts`) need a
real, throwaway Supabase project to sign real accounts up against — they are
excluded from `npm run e2e` entirely (`testIgnore` in `playwright.config.ts`)
unless `E2E_SUPABASE=1`, never run-and-left-to-fail and never `test.skip`
(which would look like a passing, exercised test):

```bash
E2E_SUPABASE=1 npm run e2e
```

Full test matrix and known gaps: [`docs/TESTING.md`](docs/TESTING.md).

## Deployment

Vercel for the web app, any long-running Docker host (Fly.io, Railway, a
VPS) for the worker, Supabase for the backend. Summary:

1. Push migrations to a real Supabase project, create the `audio`
   (private)/`avatars` (public) storage buckets (migration 13 does this —
   don't recreate by hand), enable Realtime for `notifications`/`messages`.
2. Deploy this app to Vercel with the three Supabase env vars set as
   server + preview + production variables (`SUPABASE_SERVICE_ROLE_KEY` as
   **server-only**, never exposed with a `NEXT_PUBLIC_` prefix).
3. Build and run `Dockerfile.worker` (ffmpeg preinstalled) anywhere that
   supports a long-running container, with the same three env vars.

Full walkthrough, smoke checklist and rollback: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
