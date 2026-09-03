# AKINTI — Architecture

A modular monolith. No microservices, no separate API gateway. Next.js is
both the UI and the server; Supabase is the entire backend (Postgres, Auth,
Storage, Realtime); one Node worker process handles audio jobs. See
`PRODUCT.md` for what we're building and `DATABASE.md`/`AUDIO_ARCHITECTURE.md`
for the two subsystems with the most design weight.

## Stack

- **Frontend:** Next.js 16.3 (App Router), React 19, TypeScript, Tailwind 4.
- **Backend:** Supabase — Postgres 17, Supabase Auth, Supabase Storage,
  Realtime where needed (messaging, notifications).
- **Audio tooling:** wavesurfer.js for playback/waveform rendering (owned by
  the UI/audio agent, `src/lib/audio`); ffmpeg for server-side processing,
  invoked from `scripts/worker.ts` (owned by this layer).
- **Deployment:** Vercel (web app). The worker is a long-running Node
  process and does **not** run as a Vercel serverless function — see
  `AUDIO_ARCHITECTURE.md` for why.
- **Testing:** Vitest (unit), Playwright (e2e).

## Next.js 16 specifics (read before touching routing/auth code)

Next 16 renamed `middleware.ts` → **`proxy.ts`**, and `cookies()` is now
**async**. Both matter here:

- `src/proxy.ts` exports `proxy(request)` (not `middleware`). Its only job is
  refreshing the Supabase session cookie via `updateSession()` in
  `src/lib/supabase/middleware.ts`. It is NOT an authorization boundary —
  proxy code can run on a CDN edge and must never be trusted for access
  control. Every real authorization decision lives in Postgres RLS
  (`SECURITY.md`) and is re-checked in server code.
- `src/lib/supabase/server.ts` awaits `cookies()` before constructing a
  client, and creates a **new client per request** — Supabase server clients
  are not safe to cache across requests.
- Full details: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
  and `.../04-functions/cookies.md`.

## Layers and ownership

```
src/app/**            UI routes, Server Components, Server Functions   (UI agent)
src/components/**      Presentational + client components               (UI agent)
src/lib/audio/**       wavesurfer/MediaRecorder integration              (UI agent)
src/lib/ui/**          Design tokens, primitives                         (UI agent)
src/config/**          App-level config (not Supabase)                   (UI agent)
------------------------------------------------------------------------------------
src/lib/supabase/**    Supabase client factories + config                (this layer)
src/proxy.ts           Session refresh only                              (this layer)
src/types/database.ts  Hand-written Database type (mirrors migrations)   (this layer)
src/types/domain.ts    App-level domain types (camelCase)                (this layer)
src/lib/db/**          Typed query helpers, one file per domain area     (this layer)
src/lib/validation/**  Zod input schemas                                 (this layer)
supabase/**            Migrations, seed, storage/RLS policy              (this layer)
scripts/worker.ts      Audio processing worker                          (this layer)
docs/**                This directory                                   (this layer)
```

`src/lib/db/**` never imports a Supabase client itself — every helper takes
one as its first argument (`Db` = `SupabaseClient<Database>`). That keeps the
same functions usable from a Server Component, a Server Function, a Route
Handler, and the worker (via the admin client) without guessing which auth
context they're in, and makes them trivial to test against a stubbed client.

## Data flow

```
Client (browser client, RLS-scoped)
   → src/lib/db/<domain>.ts (validated with src/lib/validation/*, mapped
     row → domain type via src/lib/db/mappers.ts)
   → Supabase client (@supabase/ssr)
   → PostgREST → Postgres (RLS + triggers enforce authorization + invariants)
```

Reads and writes both go through RLS by default. The **only** place service
role (RLS-bypassing) access is legitimate:

1. `scripts/worker.ts` claiming/completing audio jobs.
2. Minting signed URLs for private audio, strictly *after* the caller's own
   RLS-scoped client has already confirmed they may see that asset
   (`mintSignedAudioUrl` in `src/lib/db/audioAssets.ts` — see `SECURITY.md`).
3. Moderation tooling (not yet built — reports are filed by users today,
   reviewed by future internal tooling using the admin client).

## Why a hand-written `Database` type

`src/types/database.ts` is written by hand rather than generated, because
this environment doesn't have Supabase CLI access to a running project. It
must be kept byte-for-byte accurate to the migrations — **update it in the
same commit as any schema change.** One structural rule that is easy to break
silently: every row shape must be a `type` alias, not an `interface`, and
`Relationships` must stay a mutable array. `@supabase/postgrest-js`'s
`GenericTable`/`GenericSchema` types require a plain `Record<string,
unknown>`-compatible shape; a TypeScript `interface` does not structurally
satisfy that (interfaces are "open" for declaration merging, so TS won't
treat them as having an implicit index signature) even when every field is a
plain string-keyed property. Get either of those wrong and `SupabaseClient<Database>`
silently collapses its `Schema` generic to `never`, `Database.ts` still
compiles, and every `.from()`/`.rpc()` call in the app fails to typecheck
with confusing "not assignable to type 'never'" errors and no runtime
symptom at all. See the comment above the `Relationships` type for the full
explanation.

## Explore ranking

`public.wave_trending_score()` (migration 14) is a deterministic, explainable,
time-decayed weighted score — no ML in v1 (spec §10). It's a standalone SQL
function specifically so a real recommender can replace it later without any
call site changing; `src/lib/db/waves.ts#listTrendingWaves` calls the
`trending_waves` RPC wrapper, not the scoring function directly.

## Search

`search_profiles`/`search_waves` (migration 14) are the only search entry
points the app calls. Today they're Postgres trigram (`pg_trgm`) matching;
swapping in full-text search or an external index later means changing the
SQL function bodies, not any call site (spec §24).

## What this layer explicitly does not own

UI state, playback state, the recorder, design tokens, and route
composition are the UI/audio agent's responsibility (`src/app`,
`src/components`, `src/lib/audio`, `src/lib/ui`, `src/config`,
`globals.css`, `src/test`). This layer stops at typed data access and the
database/storage/worker that backs it.
