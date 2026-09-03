# AKINTI — Security

Authorization is designed around the database, not the client (spec §32).
Every rule in this document is enforced in Postgres; the application layer
re-checks the same predicates for good error messages and to avoid needless
round-trips, but a policy hidden in the UI only is never treated as
enforcement anywhere in this codebase.

## Authentication (spec §8, §32)

Supabase Auth (email/password; OAuth-ready via `src/app/auth/callback/route.ts`),
sessions carried in cookies through `@supabase/ssr`. The signup trigger
(`handle_new_user`, migration 02) creates the `profiles` row synchronously, so
there is never a signed-in user with no profile.

**Server API — `src/lib/auth/server.ts`** (Server Components/Actions/Route
Handlers only; never imported from a client component):

- `getSession()` — the raw, cookie-trusting session. Fast, NOT verified —
  never use it for an authorization decision.
- `getCurrentUser()` — the signed-in user, verified against the auth server
  via `getUser()`. `null` when signed out **or when Supabase isn't
  configured** — every caller degrades to the signed-out UI rather than
  throwing (`isSupabaseConfigured()`, `src/lib/supabase/config.ts`).
- `getCurrentProfile()` / `getCurrentUserWithProfile()` — the above plus the
  mapped `profiles` row.
- `requireUser(nextPath?)` — redirects to `/login?next=<nextPath>` if signed
  out; otherwise returns the verified user.
- `requireOnboarded(nextPath?)` — `requireUser` plus a redirect to
  `/onboarding` if `profiles.onboarded_at` is still null. `/onboarding` itself
  must never call this (it would redirect to itself).

**Client API — `src/lib/auth/AuthProvider.tsx`**: `<AuthProvider>` (mounted
once in `src/app/providers.tsx`, hydrated from `getCurrentUserWithProfile()`
in the root layout so first paint never flashes signed-out) and
`useCurrentUser()`, kept live via `supabase.auth.onAuthStateChange`.

**Server Actions — `src/app/(auth)/actions.ts`** (`signUp`, `signIn`,
`signOut`, `requestPasswordReset`, `updatePassword`) and
**`src/app/(auth)/onboarding/actions.ts`** (`completeOnboarding`,
`followSuggestedCreator`) never throw to the client — every action returns
`{ ok, fieldErrors?, formError?, message? }` (`src/lib/auth/types.ts`).
Supabase Auth error codes are translated to English by `mapAuthError`
(`src/lib/auth/errors.ts`) — a raw Supabase/Postgres error string is never
forwarded to a form.

### Route protection matrix

Enforced twice: `src/proxy.ts` (via `updateSession`,
`src/lib/supabase/middleware.ts`) redirects as a UX convenience at the edge;
every protected Server Component independently calls
`requireUser`/`requireOnboarded` as defense-in-depth. **Neither is the
authorization boundary** — that is Postgres RLS, below. Public routes are the
single list in `isPublicRoute` (`src/config/routes.ts`); everything else is
protected.

| Visitor state | Public route (`/explore`, `/w/[id]`, `/u/[username]`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/*`, `/kit`) | Protected route (`/`, `/create`, `/messages*`, `/notifications`, `/settings*`) |
|---|---|---|
| Anonymous | renders normally | → `/login?next=<path>` |
| Signed in, not onboarded | renders normally | → `/onboarding` (except `/onboarding` itself) |
| Signed in, onboarded | renders normally | renders normally |
| Signed in, visiting `/login` or `/signup` | — | → `/` (checked before the public-route rule) |

Onboarding is skippable at every step (spec §8) — "not onboarded" only means
`profiles.onboarded_at is null`; the onboarding wizard's global "Skip for
now" always finishes it (sets `onboarded_at`, possibly with defaults) rather
than leaving a dead end a user could get stuck behind.

### Password reset / email confirmation

Both flows share `src/app/auth/callback/route.ts` (PKCE code exchange,
allow-listed in `supabase/config.toml`'s `additional_redirect_urls`):
`requestPasswordReset` points `redirectTo` at
`/auth/callback?next=/reset-password`; `signUp`'s `emailRedirectTo` points at
`/auth/callback?next=/onboarding`. A failed/expired exchange redirects to
`/login?error=callback_failed` rather than rendering a raw error. `next` is
always sanitized to a same-origin relative path (`sanitizeNextPath`) before
being used in a redirect, to rule out an open-redirect via a crafted `next`
value.

### Never a fake login (spec §44 rule 9)

`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are unset in this
environment (`AGENTS.md`). Every auth surface checks `isSupabaseConfigured()`
first and renders an explicit "Backend not configured" state — sign-in,
sign-up, password reset and onboarding never simulate success, and
`getCurrentUser()`/`getSession()` return `null` rather than throwing so the
rest of the app degrades to its normal signed-out UI instead of crashing.

## Authorization model

**Single source of truth: the predicate functions in migration 10**
(`can_view_wave`, `can_comment_on_wave`, `can_request_duet`,
`can_view_audio_asset`, `can_view_profile`, `can_view_profile_content`,
`is_following`, `are_mutual_followers`, `is_blocked_between`,
`audience_allows`, `can_message`, `is_conversation_member`). Both RLS
policies (migration 12) and `src/lib/db/**` call these — never a hand-rolled
equivalent — so the database and the application can never quietly drift
apart on who can see what.

`can_view_wave(wave_id)` is the load-bearing one: soft-delete, creator
self-access, blocks, accepted-collaborator credit, per-Wave visibility, and
the creator's profile privacy all fold into one boolean. Everything else
(comments, saves, shares, audio asset access, search results) is only
reachable through a Wave that already passed this check.

## Row Level Security

**RLS is enabled on every table in `public`. A table with no policy for an
operation denies that operation by default** — there is no table anywhere
in this schema that a signed-in user can read or write without an explicit
policy backing it. Highlights:

- `profiles_select` uses `can_view_profile` (identity card — username,
  avatar — visible unless blocked, so a private account can still be found
  and follow-requested); the account's *content* (Waves, follower list) goes
  through the stricter `can_view_profile_content`.
- `waves_select`/`comments_select`/`audio_assets_select` all key off
  `can_view_wave`/`can_view_audio_asset` — a private Wave is unreachable via
  guessed IDs, the feed/search RPCs, or a share link, because every one of
  those read paths is still filtered by the same RLS policy underneath.
- `saves` has no policy letting anyone but the saver read their own saves —
  Saves are private; only the aggregate `waves.save_count` is public.
- `play_events`/`wave_listens` have **no client write policy at all**. The
  only way to affect them is `record_play_event()` (SECURITY DEFINER),
  which is itself server-authoritative about what counts as a Play/Replay.
- `notifications` has no client INSERT policy — the only writer is
  `push_notification()`, called from triggers.

## Write guards (server-owned columns)

RLS controls *whether* a row is writable; **BEFORE triggers control *which
columns* survive the write**, for anything a client must never forge:

- `waves_guard_insert`/`waves_guard_update` — force counters
  (`play_count`, ...) to `0`/unchanged, verify the audio asset belongs to
  the claimed creator, and independently re-verify a Duet's parent request
  before letting `creation_type = 'duet'` through.
- `audio_assets_guard_update` — rejects any client attempt to touch
  `processed_path`, `peaks`, `processing_status`, `processing_error`,
  `processed_at`, `owner_id`, `original_path`, `storage_bucket`,
  `byte_size`, `checksum_sha256`. Only the worker (flagged via
  `is_service_request()`) may set these.
- `duet_requests_guard` — the whole state machine from `DUET_SPEC.md`, plus
  forcing `recipient_id` to the Wave's actual creator regardless of what a
  client sends.
- `messages_guard_insert` — re-checks blocks between every conversation
  member and the sender on every send, even though the sender already
  passed `is_conversation_member` at the RLS layer.
- `reports_guard` — a client-submitted report is always forced to `status =
  'open'` with no reviewer/resolution fields; only `is_service_request()`
  (moderation tooling using the admin client) may set a verdict.

`is_service_request()` (migration 01) is what these guards check to allow
themselves through for legitimate server-side writes — true when the JWT
role claim is `service_role`, or inside a `SECURITY DEFINER` routine that
explicitly flags itself via `set_config('akinti.system', 'on', true)` (used
by `complete_audio_job`/`fail_audio_job` so they can update `audio_assets`'
guarded columns without being the service role client themselves).

## Storage security (spec §33)

Two buckets only:

- **`audio` — PRIVATE.** No listener SELECT policy on `storage.objects` at
  all; only the object's owner can sign their own file directly. Every other
  listener gets audio exclusively through `mintSignedAudioUrl`/
  `mintPlaybackUrl` (`src/lib/db/audioAssets.ts`): the caller's RLS-scoped
  client authorizes via `can_view_audio_asset` first, then the **admin
  (service-role) client** mints a 10-minute signed URL. Raw storage paths
  are never sent to the browser outside that flow. Full detail:
  `AUDIO_ARCHITECTURE.md`.
- **`avatars` — PUBLIC.** The one public image surface (profile pictures
  only — spec §3.2 bans image posts). World-readable, owner-writable, keyed
  `avatars/<owner_id>/<filename>`.

Object key convention for both buckets: **the first path segment is always
the owner's `auth.uid()`**, which is exactly what every storage policy keys
off (`(storage.foldername(name))[1] = auth.uid()::text`).

## Blocking (spec §26)

`blocks` is directional in storage, symmetric in effect —
`is_blocked_between(a, b)` is what every other check calls, never a raw
`blocks` row lookup. Blocking a user immediately (via
`blocks_after_insert`, migration 12):

- Deletes any `follows` row between the two accounts, either direction.
- Cancels any `PENDING` `duet_requests` between them, either direction.
- `can_view_wave`, `can_view_profile*`, `can_message`, `can_comment_on_wave`,
  `can_request_duet` all short-circuit to deny once a block exists — a
  blocked user cannot bypass this through a direct API call, a cached
  response, or a different route into the same data (spec §26/§46).

A blocked account is never told it blocked them: `blocks` has no SELECT
policy exposing the reverse direction.

## Abuse prevention (spec §39) — what exists today, what doesn't yet

Implemented at the database level:

- **Play/Replay debounce** — duplicate raw events from the same listener
  within 5 seconds are dropped (`record_play_event`); self-plays by the
  creator never count.
- **Duplicate Duet requests** — one live `PENDING` request per `(wave,
  requester)`, enforced by a unique partial index, not just app logic.
- **Duplicate reports** — one open report per `(reporter, target)`, per
  target type, enforced the same way.
- **Comment/message abuse surfaces** — routed through `can_comment_on_wave`/
  `can_message`, both of which respect blocks and per-account permission
  settings before a row can be inserted at all.

**Not yet implemented, flagged for a follow-up:** general per-account rate
limiting on comments/follows/messages/share events/uploads (spec §39 says
"choose exact thresholds based on real usage" — no usage data exists yet in
this environment). If this is added, it belongs as another `BEFORE INSERT`
guard (a rolling-window count against `created_at`) rather than
application-layer throttling, for the same reason every other rule here
lives in the database: it must hold even against direct API calls.

## Secrets

`SUPABASE_SERVICE_ROLE_KEY` is read only in `src/lib/supabase/admin.ts`
(`requireServiceRoleKey()`), which throws if called from `typeof window !==
"undefined"`. It is never inlined into client bundles — only
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are meant to reach
the browser (RLS is what protects data behind the anon key, not secrecy of
the key itself). `.env.local` is git-ignored; `.env.example` documents the
three variables with empty values.

## No Likes (spec §3.4) — verified, not assumed

There is no `likes` table, column, enum value, RLS policy, RPC, or
notification type anywhere in `supabase/migrations/`, `src/types/database.ts`,
or `src/lib/db/**`. If a future change reintroduces a Like-shaped feature, it
is a deliberate product decision requiring a spec change, not a small
add-on — flag it to the product owner rather than building it quietly.

## Security test scenarios to keep passing (spec §46)

```
Private Wave, direct API access by a non-follower           → ACCESS DENIED
Private Wave, direct storage URL guess                       → ACCESS DENIED (no listener storage policy)
Private Wave, reached via a share link                       → still gated by can_view_wave
Private Wave, reached via search/Explore/Home feed queries   → never appears (RLS-filtered)
Blocked user attempts to message/comment/duet-request         → DENIED, in both directions
Blocked user attempts a direct API call bypassing the UI      → DENIED (RLS + guard triggers, not just hidden buttons)
```
