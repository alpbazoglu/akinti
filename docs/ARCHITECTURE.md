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

- `src/proxy.ts` exports `proxy(request)` (not `middleware`). Its job is
  refreshing the Supabase session cookie AND applying the route protection
  matrix (redirect unauthenticated/not-onboarded visitors away from
  protected routes) — both via `updateSession()` in
  `src/lib/supabase/middleware.ts`. It is NOT an authorization boundary —
  proxy code can run on a CDN edge, so every protected page independently
  re-checks with `requireUser`/`requireOnboarded` (`src/lib/auth/server.ts`).
  Every real authorization decision lives in Postgres RLS (`SECURITY.md`).
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
src/lib/auth/**        Auth domain API (server reads, redirects,         (auth agent)
                        AuthProvider/useCurrentUser, error mapping)
src/app/(auth)/**      Login/signup/password-reset/onboarding routes     (auth agent)
                        and their Server Actions
src/app/auth/callback  PKCE code exchange route handler                 (auth agent)
------------------------------------------------------------------------------------
src/lib/supabase/**    Supabase client factories + config                (this layer)
src/proxy.ts           Session refresh + route protection matrix         (this layer/auth agent)
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

## Discovery & ranking (Home, Explore, Search — spec §9, §10, §24 — Stage 6/7)

Home (`/`), Explore (`/explore`) and Search (`/search`) are owned by
`src/app/(app)/page.tsx`/`actions.ts`, `src/app/(app)/explore/**`,
`src/app/(app)/search/**`, `src/components/feed/**`, `src/lib/feed/**` and
(additively) `src/lib/db/waves.ts`/`src/lib/db/discovery.ts`/`src/lib/db/search.ts`.

### Home: the following feed (spec §9)

`listHomeFeed` (`src/lib/db/waves.ts`) is a two-step read — the viewer's
accepted `follows`, then those creators' Waves, cursor-paginated on
`published_at` — rather than a join, for the same reason every other list
helper in this file avoids embedded `profiles!fk(*)` selects: the
hand-written `Database` type has no literal FK names for supabase-js to
resolve embedding against (see "Why a hand-written `Database` type" above).
`loadFollowingFeed` (`src/app/(app)/actions.ts`) wraps it for pagination past
the first page, which `page.tsx` loads directly server-side. An account with
no follows never sees a blank feed: the empty state routes into Explore, with
a "Record your first Wave" link one tap from the same screen (spec §8's "aha
moment" requirement).

### Ranking (spec §10): the formula, weights and decay

`public.wave_trending_score()` (migration `20260903121400_search.sql`) is a
deterministic, explainable, time-decayed weighted score — no ML in v1:

```
score = (plays × 1 + replays × 3 + saves × 4 + comments × 5 + shares × 6 + duets × 12)
         ÷ 2^(age_days / 2)
```

Freshness half-life is **48 hours** (a Wave's score halves every two days of
age, independent of engagement). Duets are weighted highest because
collaboration — not passive consumption — is this product's differentiation
goal (spec §48); Saves and Comments outweigh a bare Play because they are
deliberate acts, not just "audio entered the viewport" (spec §13).

The function is standalone specifically so a real recommender can replace it
later without any call site changing (spec §10: "ranking as a separate,
swappable scoring function"). `src/lib/db/waves.ts#listTrendingWaves` calls
the `trending_waves` RPC wrapper, never the scoring function directly, and
`trending_waves` evaluates it against live counters — nothing caches or
periodically recomputes a score, since Postgres can score+sort the current
candidate set cheaply enough at this scale that a materialized view + refresh
job would be premature. **Refresh strategy, if that changes:** the query
already accepts `p_max_age_hours` (default 336h / 14 days) to bound the
candidate set; if scoring live ever becomes too expensive, the next step is a
materialized view refreshed by `pg_cron` (if available on the Supabase
project) or a periodic call from `scripts/worker.ts`'s existing maintenance
loop — no schema change, just a cached read path in front of the same
formula.

`src/lib/feed/ranking.ts` is a pure TypeScript mirror of this SQL — weights
(`RANKING_WEIGHTS`), half-life (`FRESHNESS_HALF_LIFE_HOURS`) and the formula
itself (`waveTrendingScore`), all unit-tested (`ranking.test.ts`) against
fixture cases (single-weight isolation, linear summation, exact half-life
decay, clock-skew safety). Nothing in the running app calls this TS version
to rank a live list — the RPC above is the source of truth, so ranking can
never drift from what a client last read — it exists purely so the formula is
documented, unit-testable without a database, and swappable behind the
`RankingScorer` interface it also exports.

### Explore categories (spec §10)

Trending, New, Rising, Original, Voices, Compositions, Open for Duet
(`src/lib/feed/categories.ts#EXPLORE_CATEGORIES`), each backed by one
`src/lib/db/waves.ts` read:

| Category | Source | Pagination |
|---|---|---|
| Trending | `trending_waves` RPC (score order) | offset (`src/lib/feed/cursor.ts`) |
| New | `listNewWaves` — every `visibility='everyone'` Wave, newest first | `published_at` cursor |
| Rising | `listWavesByCreatorIds` over a pool from `rising_creators` (below), newest first | `published_at` cursor |
| Original | `listOriginalWaves` — `content_origin='original'` | `published_at` cursor |
| Voices | `listWavesByTags(VOICE_TAGS)` | `published_at` cursor |
| Compositions | `listWavesByTags(COMPOSITION_TAGS)` | `published_at` cursor |
| Open for Duet | `listOpenForDuet` — `duet_permission` allows requests | `published_at` cursor |

Only Trending is score-ordered, so only Trending needs an offset cursor —
`src/lib/feed/cursor.ts#encodeOffsetCursor`/`decodeOffsetCursor` turn "how
many rows already loaded" into the same opaque `string | null` shape every
other list already returns, so `ExploreView`/`WaveFeedList`
(`src/components/feed`) never have to know a category's pagination strategy.

**Voices/Compositions tag mapping.** `waves.tags` is free text (up to 8
entries, spec §11), but `CreateWaveForm` only ever writes from a fixed set —
`WAVE_CATEGORY_OPTIONS` (`src/lib/audio/createDraft.ts`): Music, Talk,
Storytelling, Comedy, News, Education, ASMR, Other — lower-cased on write by
`tagsSchema`. `src/lib/feed/categories.ts` maps that vocabulary:

- **Voices** — `talk`, `storytelling`, `comedy`, `news`, `education`, `asmr`
- **Compositions** — `music`
- `other` and any free-form tag outside this set belong to neither lane; a
  Wave can appear in both if it carries tags from both groups.

Matched via `waves.tags && ARRAY[...]` (Postgres array overlap), which uses
the existing `waves_tags_idx` GIN index (migration 04) — no new migration
needed for these two categories.

**Rising** (creators *and* Waves are two different reads). The "Rising
creators" strip and the Rising *category tab* share one signal but serve
different content:

- `public.rising_creators()` (migration `20260903130000_explore_discovery.sql`)
  — a standalone SQL routine, mirroring `wave_trending_score`'s "swappable
  later" shape, that finds public profiles with either recent accepted-follow
  growth (default window: 7 days) or a first-ever Wave published inside that
  window. Wrapped by `src/lib/db/discovery.ts#getRisingCreators`. The
  "creators strip" (`RisingCreatorsStrip`) shows a handful of these with the
  existing `FollowButton` (never modified, only consumed) — `getFollowEdgesForViewer`
  batches both follow directions for the whole strip in two queries, not one
  RPC round trip per card.
- The **Rising Wave list** (the category tab) pools the top ~60 rising
  creator ids from the same function, then paginates their Waves by
  `published_at` like every other time-ordered category — it is not itself
  score/offset-paginated, only the creator signal that feeds it is computed
  differently from a plain `ORDER BY`.

An additional partial index, `waves_original_content_published_idx`
(same migration), keeps Original from degrading into a filtered scan of every
public Wave as the table grows — it mirrors `listOriginalWaves`'s exact
predicate the way `waves_open_for_duet_idx` (migration 04) already does for
Open for Duet.

### Batched hydration, not N+1 (spec §35)

`src/lib/feed/hydrate.ts#hydrateWaveCards` turns a page of `Wave` rows into
`WaveCardContainer`-ready cards with, at most, one query per *kind* of data
for the whole page — creators (`getProfilesByIds`), accepted collaborators
(`listCollaboratorsForWaves`, new in `waves.ts`), and the viewer's saved-state
(`listSavedWaveIds`, a direct minimal read of `saves` mirroring how
`notifications/actions.ts` already reads `wave_collaborators` directly for
the same reason: no dedicated multi-id helper exists in that table's owning
file). The one deliberate exception is `audio_assets`: `src/lib/db/audioAssets.ts`
(audio agent-owned) exposes only a single-id read, so that one is
`Promise.all`'d across the page — still one wave of parallel round trips, not
serial. This never fetches playable audio itself: `WaveCardContainer` already
resolves a signed URL lazily, on first play (spec §35: never load all audio
up front), so hydration only ever touches waveform peaks/duration metadata,
which every card needs to render at all.

`canRequestDuet` is deliberately **not** computed per card in a feed/Explore
context — doing so would mean one `can_request_duet` RPC round trip per Wave
on every page. It defaults optimistically to `true` (`WaveCard`'s own
default); the real authorization check still runs server-side the moment a
Duet is actually requested (spec §15: "Enforced server-side, not just hidden
in the UI"), so this is a UX nuance, not a security gap. Wave-detail pages
that show exactly one card (`/w/[id]`) still compute it precisely, since the
cost there is one RPC call, not twenty.

### Search (spec §24)

`search_profiles`/`search_waves` (migration `20260903121400_search.sql`) are
Postgres trigram (`pg_trgm`) matching — the only search entry points RLS-
scoped code calls. `src/lib/db/search.ts` adds the swap seam the spec asks
for on top of them: a `SearchProvider` interface
(`searchProfiles`/`searchWaves`) with one implementation today
(`trigramSearchProvider`); replacing trigram with Postgres full-text search
or an external index later means writing a new `SearchProvider` and changing
one binding, not any call site — `/search`
(`src/app/(app)/search/page.tsx`, `SearchView`) never imports
`profiles.ts`/`waves.ts` directly. `searchAll` runs both lanes in parallel and
is what the page/`SearchView` actually call.

No separate `search_all` SQL RPC was added: `search_profiles` and
`search_waves` return differently-shaped rows (`ProfileRow[]` vs
`WaveRow[]`), so combining them as one SQL function would mean an awkward
union or a jsonb-wrapped composite return; calling both existing typed RPCs
in parallel from `searchAll` is simpler, fully typed, and just as swappable.

Both RPCs already run under RLS, so a private profile or Wave — and anything
either party of a block relationship should not see — never surfaces
regardless of the search UI, matching spec §24/§46's "results respect
visibility and blocks" requirement without any extra filtering in this layer.
`SearchView` debounces client-side (300ms, driven from the input's own change
handler rather than an effect watching `query`, per React's guidance against
synchronous `setState` inside effects) and keeps the URL's `?q=` in sync via
`router.replace` so a search is shareable and survives a refresh; the first
page still renders server-side in `search/page.tsx` so `curl /search?q=x`
returns real results, not an empty shell.

## Auth module (spec §8, §32 — Stage 2)

`src/lib/auth/` is deliberately split into two files that are never barreled
together:

- `server.ts` — `getSession`, `getCurrentUser`, `getCurrentProfile`,
  `getCurrentUserWithProfile`, `requireUser`, `requireOnboarded`. Imports
  `next/headers` (via `src/lib/supabase/server.ts`), so it must only ever be
  imported from a Server Component, Server Action or Route Handler.
- `AuthProvider.tsx` (+ `index.ts`) — the client-safe half: `<AuthProvider>`
  and `useCurrentUser()`. `index.ts` re-exports only this file plus
  `errors.ts`/`types.ts` — never `server.ts` — so a client component
  importing `@/lib/auth` can never accidentally pull `next/headers` into the
  browser bundle. This mirrors `src/lib/supabase`, which has no barrel for
  the same reason.

`AuthProvider` is hydrated once, in `src/app/layout.tsx`
(`getCurrentUserWithProfile()`) → `src/app/providers.tsx`, so the first
client render already knows who's signed in — no signed-out flash before
`onAuthStateChange` catches up.

Auth Server Actions (`src/app/(auth)/actions.ts`,
`src/app/(auth)/onboarding/actions.ts`) all return
`{ ok, fieldErrors?, formError?, message? }` (`src/lib/auth/types.ts`) and
never throw to the client; `mapAuthError` (`src/lib/auth/errors.ts`)
translates Supabase Auth error codes to English so a raw backend message
never reaches a form. Full route protection matrix and the password
reset/confirmation flow: `SECURITY.md`.

Onboarding (`src/app/(auth)/onboarding/`) writes to `profiles.interests`
and `profiles.onboarded_at` — both already part of the `profiles` table
(migration 02, `identity_and_social_graph`), so Stage 2 needed no new
migration for it.

## What this layer explicitly does not own

UI state, playback state, the recorder, design tokens, and route
composition are the UI/audio agent's responsibility (`src/app`,
`src/components`, `src/lib/audio`, `src/lib/ui`, `src/config`,
`globals.css`, `src/test`). This layer stops at typed data access and the
database/storage/worker that backs it.
