/**
 * Prompts & challenges (PRODUCT_V2 §4 "weekly theme + backing track, curated
 * Top 5, hashtag pages"), migration `20260905130000_challenges.sql`.
 *
 * Reads ride on RLS (`challenges_select`/`challenge_entries_select`/
 * `challenge_picks_select`, all keyed off `status in ('live', 'closed')` or
 * `is_moderator()` — the single source of truth, never re-implemented here).
 * `enterChallenge` calls the `enter_challenge` RPC, whose real enforcement
 * (owns the wave, challenge is live, rate-limited) lives in the
 * `challenge_entries_guard` trigger, not in this file or the RPC body — see
 * the migration's own comments.
 *
 * Hashtag pages (`listWavesByHashtag`) reuse `waves.tags`; there is no
 * separate tagging mechanism.
 */

import type {
  Challenge,
  ChallengeEntry,
  ChallengePick,
  ChallengeStatus,
  DuetMode,
  Page,
  Wave,
} from "@/types/domain";

import { toChallenge, toChallengeEntry, toChallengePick, toWave } from "./mappers";
import type { Db } from "./types";
import { clampLimit, DatabaseError, unwrap } from "./types";

/* ------------------------------------------------------------------------ */
/* Pure helpers (unit-testable without a database)                          */
/* ------------------------------------------------------------------------ */

/** Encodes the keyset cursor every RPC in this module expects: `"<value>|<id>"` — same shape `list_open_calls`/`list_backing_tracks` use. */
export function encodeChallengeCursor(value: string, id: string): string {
  return `${value}|${id}`;
}

/**
 * Decodes a cursor produced by `encodeChallengeCursor`. Returns `null` for a
 * malformed cursor — every RPC here treats that as "start from the top"
 * rather than erroring, matching this codebase's forgiving-cursor style.
 */
export function decodeChallengeCursor(raw: string): { value: string; id: string } | null {
  const sep = raw.indexOf("|");
  if (sep === -1) return null;
  const value = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (!value || !id) return null;
  return { value, id };
}

/**
 * Time-window phase of a challenge, independent of its stored `status`
 * (which gates draft/live/closed *visibility*, not the calendar). Pure so it
 * can render honest copy ("Ends in 3 days") without a database round-trip.
 */
export type ChallengePhase = "upcoming" | "active" | "ended";

export function deriveChallengePhase(
  challenge: Pick<Challenge, "startsAt" | "endsAt">,
  now: Date = new Date(),
): ChallengePhase {
  const nowMs = now.getTime();
  if (nowMs < new Date(challenge.startsAt).getTime()) return "upcoming";
  if (nowMs >= new Date(challenge.endsAt).getTime()) return "ended";
  return "active";
}

/* ------------------------------------------------------------------------ */
/* Reads                                                                     */
/* ------------------------------------------------------------------------ */

export interface ListChallengesParams {
  status?: ChallengeStatus | null;
  cursor?: string | null;
  limit?: number;
}

/** `/challenges` (spec: weekly theme listing). RLS-scoped — a draft only appears for its author/a moderator. */
export async function listChallenges(db: Db, params: ListChallengesParams = {}): Promise<Page<Challenge>> {
  const limit = clampLimit(params.limit);
  const result = await db.rpc("list_challenges", {
    p_status: params.status ?? null,
    p_cursor: params.cursor ?? null,
    p_limit: limit,
  });
  const rows = unwrap("listChallenges", { data: result.data ?? [], error: result.error });
  const items = rows.map(toChallenge);
  const nextCursor =
    rows.length === limit ? encodeChallengeCursor(items[items.length - 1].startsAt, items[items.length - 1].id) : null;
  return { items, nextCursor };
}

/** `/challenges/[slug]`. `null` when missing or hidden (RLS) — never distinguished, matching `can_view_wave`'s "denial and absence look the same" rule. */
export async function getChallengeBySlug(db: Db, slug: string): Promise<Challenge | null> {
  const result = await db.rpc("get_challenge", { p_slug: slug });
  if (result.error) {
    throw new DatabaseError("getChallengeBySlug", result.error);
  }
  return result.data ? toChallenge(result.data) : null;
}

export interface ListChallengeEntriesParams {
  cursor?: string | null;
  limit?: number;
}

/** Entries for one challenge (spec: `list_challenge_entries`). RLS-scoped. */
export async function listChallengeEntries(
  db: Db,
  challengeId: string,
  params: ListChallengeEntriesParams = {},
): Promise<Page<ChallengeEntry>> {
  const limit = clampLimit(params.limit);
  const result = await db.rpc("list_challenge_entries", {
    p_challenge_id: challengeId,
    p_cursor: params.cursor ?? null,
    p_limit: limit,
  });
  const rows = unwrap("listChallengeEntries", { data: result.data ?? [], error: result.error });
  const items = rows.map(toChallengeEntry);
  const nextCursor =
    rows.length === limit
      ? encodeChallengeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;
  return { items, nextCursor };
}

/** The curated Top 5 for a challenge, ranked. At most 5 rows — no pagination needed. */
export async function listChallengePicks(db: Db, challengeId: string): Promise<ChallengePick[]> {
  const result = await db
    .from("challenge_picks")
    .select("*")
    .eq("challenge_id", challengeId)
    .order("rank", { ascending: true });
  if (result.error) {
    throw new DatabaseError("listChallengePicks", result.error);
  }
  return (result.data ?? []).map(toChallengePick);
}

export interface ListWavesByHashtagParams {
  cursor?: string | null;
  limit?: number;
}

/** Hashtag pages (spec: "hashtag pages") — reuses `waves.tags`, no separate tagging mechanism. */
export async function listWavesByHashtag(
  db: Db,
  tag: string,
  params: ListWavesByHashtagParams = {},
): Promise<Page<Wave>> {
  const limit = clampLimit(params.limit);
  const result = await db.rpc("list_waves_by_hashtag", {
    p_tag: tag,
    p_cursor: params.cursor ?? null,
    p_limit: limit,
  });
  const rows = unwrap("listWavesByHashtag", { data: result.data ?? [], error: result.error });
  const items = rows.map(toWave);
  const nextCursor =
    rows.length === limit
      ? encodeChallengeCursor(items[items.length - 1].publishedAt, items[items.length - 1].id)
      : null;
  return { items, nextCursor };
}

/** Thin wrapper over `can_enter_challenge()` — used for an honest pre-submit UI check, never the enforcement itself (`challenge_entries_guard` is). */
export async function canEnterChallenge(db: Db, challengeId: string, waveId: string): Promise<boolean> {
  const result = await db.rpc("can_enter_challenge", { p_challenge_id: challengeId, p_wave_id: waveId });
  return unwrap("canEnterChallenge", result);
}

/* ------------------------------------------------------------------------ */
/* Writes                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Enter `waveId` into `challengeId` (spec: "entering requires owning the wave
 * and the challenge being live"). Idempotent — entering twice returns the
 * same entry id, mirroring `answerOpenCall`'s style. Returns the new/existing
 * `challenge_entries.id`.
 */
export async function enterChallenge(db: Db, challengeId: string, waveId: string): Promise<string> {
  const result = await db.rpc("enter_challenge", { p_challenge_id: challengeId, p_wave_id: waveId });
  return unwrap("enterChallenge", result);
}

/** Withdraw the caller's own entry (or, for a moderator, anyone's — `challenge_entries_delete` RLS). */
export async function withdrawChallengeEntry(db: Db, challengeId: string, waveId: string): Promise<void> {
  const result = await db
    .from("challenge_entries")
    .delete()
    .eq("challenge_id", challengeId)
    .eq("wave_id", waveId);
  if (result.error) {
    throw new DatabaseError("withdrawChallengeEntry", result.error);
  }
}

export interface CreateChallengeInput {
  slug: string;
  title: string;
  brief: string;
  hashtag: string;
  startsAt: string;
  endsAt: string;
  backingTrackId?: string | null;
  duetMode?: DuetMode | null;
  status?: ChallengeStatus;
}

/** Moderator-only (`challenges_insert` RLS re-checks `is_moderator()` independently of any app-layer gate). */
export async function createChallenge(db: Db, input: CreateChallengeInput): Promise<Challenge> {
  const result = await db
    .from("challenges")
    .insert({
      slug: input.slug,
      title: input.title,
      brief: input.brief,
      hashtag: input.hashtag,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      backing_track_id: input.backingTrackId ?? null,
      duet_mode: input.duetMode ?? null,
      status: input.status ?? "draft",
    })
    .select("*")
    .single();
  return toChallenge(unwrap("createChallenge", result));
}

/** Moderator-only. Transitions a challenge between `draft`/`live`/`closed`. */
export async function setChallengeStatus(db: Db, challengeId: string, status: ChallengeStatus): Promise<Challenge> {
  const result = await db
    .from("challenges")
    .update({ status })
    .eq("id", challengeId)
    .select("*")
    .single();
  return toChallenge(unwrap("setChallengeStatus", result));
}

export interface UpsertChallengePickInput {
  challengeId: string;
  waveId: string;
  /** 1..5 */
  rank: number;
  note?: string | null;
}

/**
 * Set (or replace) the wave holding one of a challenge's 5 curated ranks.
 * Moderator-only (`challenge_picks_insert`/`_update` RLS); `wave_id` must
 * already be a `challenge_entries` row (`challenge_picks_guard`).
 */
export async function upsertChallengePick(db: Db, input: UpsertChallengePickInput): Promise<ChallengePick> {
  const result = await db
    .from("challenge_picks")
    .upsert(
      {
        challenge_id: input.challengeId,
        wave_id: input.waveId,
        rank: input.rank,
        note: input.note ?? null,
      },
      { onConflict: "challenge_id,rank" },
    )
    .select("*")
    .single();
  return toChallengePick(unwrap("upsertChallengePick", result));
}

/** Remove whichever wave currently holds `rank` in this challenge's Top 5. Moderator-only. */
export async function removeChallengePick(db: Db, challengeId: string, rank: number): Promise<void> {
  const result = await db
    .from("challenge_picks")
    .delete()
    .eq("challenge_id", challengeId)
    .eq("rank", rank);
  if (result.error) {
    throw new DatabaseError("removeChallengePick", result.error);
  }
}
