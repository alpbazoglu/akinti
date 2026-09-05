# AKINTI — Prompts & challenges

PRODUCT_V2 §4: "weekly theme + backing track, curated Top 5, hashtag pages."
Migration: `supabase/migrations/20260905130000_challenges.sql` (rollback:
`supabase/migrations/down/20260905130000_challenges_down.sql`).

No streaks, no badges, no public leaderboard — the Top 5 is an editorial
pick, not a competitive score (`docs/design/DESIGN.md` §12 rule 35 forbids
gamification).

## Schema

- **`challenges`** — one row per weekly theme: `slug` (unique, url-safe),
  `title`, `brief`, `hashtag` (stored without a leading `#`, lowercase),
  `starts_at`/`ends_at`, an optional `backing_track_id` (FK to
  `backing_tracks`), an optional `duet_mode` (`layer | atisma | cypher` —
  informational only, e.g. an "Atışma call" week; never enforced against a
  submitted entry), `status` (`draft | live | closed`), `created_by`
  (nullable — a seeded/system challenge has no authenticated moderator
  behind it).
- **`challenge_entries`** — one row per Wave submitted to a challenge
  (`challenge_id`, `wave_id`, `user_id`, `created_at`). Unique on
  `(challenge_id, wave_id)` — the same Wave cannot enter twice.
- **`challenge_picks`** — the curated Top 5 (`challenge_id`, `wave_id`,
  `rank` 1..5, `picked_by`, `note`). Unique on `(challenge_id, rank)` and
  `(challenge_id, wave_id)`; a pick must reference a Wave that actually has a
  `challenge_entries` row (`challenge_picks_guard`).

## Authorization

Everything below is enforced in Postgres first (`docs/SECURITY.md`'s rule:
never trust a client-hidden button as enforcement).

- **Reads.** Anyone reads a `live`/`closed` challenge and its entries/picks
  (`challenges_select`/`challenge_entries_select`/`challenge_picks_select`
  RLS). A `draft` is visible only to its author or a moderator
  (`is_moderator()`, migration 23 — reused, not re-implemented).
- **Creating challenges/picks.** Moderator-only
  (`challenges_insert`/`_update`, `challenge_picks_insert`/`_update` RLS,
  all keyed off `is_moderator()`).
- **Entering.** `can_enter_challenge(challenge_id, wave_id)` (single source
  of truth, mirrors `can_request_duet`'s role) requires the challenge to be
  `live` and the caller to own the Wave. Both the RLS insert policy and
  `enter_challenge()` call this rather than each re-implementing it.
  `challenge_entries_guard` (a `BEFORE INSERT` trigger, fires regardless of
  whether the row arrived via a direct insert or the RPC) re-derives
  `user_id` from the caller and rate-limits with the existing
  `check_rate_limit()` — action `'challenge_entry'`, 10 per hour per user,
  raising SQLSTATE `AKRTL` exactly like every other rate-limited action
  (`docs/SECURITY.md` — map it with `src/lib/moderation/errors.ts`).

## RPCs (`src/lib/db/challenges.ts`)

| RPC | App helper | Notes |
|---|---|---|
| `list_challenges(status, cursor, limit)` | `listChallenges` | Keyset-paginated (`"<starts_at>\|<id>"`), RLS-scoped. |
| `get_challenge(slug)` | `getChallengeBySlug` | Single lookup; `null` when missing or hidden (RLS) — never distinguished. |
| `list_challenge_entries(challenge_id, cursor, limit)` | `listChallengeEntries` | Keyset-paginated (`"<created_at>\|<id>"`), RLS-scoped. |
| `enter_challenge(challenge_id, wave_id)` | `enterChallenge` | Idempotent (mirrors `answer_open_call`) — real enforcement is `challenge_entries_guard`, not this function's body. |
| `list_waves_by_hashtag(tag, cursor, limit)` | `listWavesByHashtag` | Hashtag pages — reuses `waves.tags` (no separate tagging mechanism), `SECURITY DEFINER` re-implementing `can_view_wave` filtering, same pattern as `list_open_calls`. |
| `can_enter_challenge(challenge_id, wave_id)` | `canEnterChallenge` | Honest pre-submit UI check, not the enforcement itself. |

`challenge_picks` and moderator writes (`createChallenge`,
`setChallengeStatus`, `upsertChallengePick`, `removeChallengePick`) go
through ordinary RLS-scoped table reads/writes, not RPCs — RLS already gates
them correctly and there's no keyset pagination need (a challenge's Top 5 is
at most 5 rows).

## Server Actions (`src/app/(app)/challenges/actions.ts`)

`enterChallengeAction`, `withdrawChallengeEntryAction` (any signed-in,
non-suspended user, for their own Wave), and the moderator-only
`createChallengeAction`, `setChallengeStatusAction`,
`upsertChallengePickAction`, `removeChallengePickAction`. All return `{ ok,
fieldErrors?, formError?, message?, data? }`, Zod-validated
(`src/lib/validation/challenges.ts`), never throw to the client, and map
`AKRTL` through `src/lib/moderation/errors.ts`.

## Screens

`src/app/(app)/challenges/page.tsx` (list) and
`src/app/(app)/challenges/[slug]/page.tsx` (detail: brief, Top 5, recent
entries) are minimal, read-only, server-rendered pages — a composer flow for
actually entering a Wave from the UI is a later agent's screen work; the
Server Actions above are ready for it.

## Seeding

```
npx tsx --env-file-if-exists=.env.local scripts/seed-challenges.ts
```

Creates two live challenges if they don't already exist (idempotent, keyed
on `slug`): **"Opening week"** (paired with a curated backing track, if
`scripts/seed-backing-tracks.ts` has been run — falls back to no track
otherwise, with a warning) and **"Atışma call"** (`duet_mode = 'atisma'`, no
backing track). No `npm run seed:challenges` entry — `package.json` is owned
by a concurrent agent for this stage; run the command above directly.

## Verifying against the live project

```
npx tsx scripts/verify-live-challenges.ts
```

Own file, not an edit to `scripts/verify-live.ts` (owned by another stage) —
same REST/PostgREST-over-HTTP approach, pass/fail table, non-zero exit on
failure: confirms `challenges`/`challenge_entries`/`challenge_picks` are
reachable, `list_challenges`/`get_challenge`/`list_challenge_entries`/
`list_waves_by_hashtag`/`can_enter_challenge` are callable, and that both
seeded challenges exist and are `live`.
