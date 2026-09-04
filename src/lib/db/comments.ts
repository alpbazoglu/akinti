/**
 * `comments`. Flat, with at most one level of replies (spec s14) — enforced
 * again by `comments_enforce_shallow_threading` even if a caller here got the
 * shape wrong.
 */

import type { CreateCommentInput, UpdateCommentInput } from "@/lib/validation/waves";
import type { Comment, Page, Wave } from "@/types/domain";

import { toComment, toWave } from "./mappers";
import type { Db } from "./types";
import { buildPage, clampLimit, decodeCursor, encodeCursor, keysetFilter, unwrap, unwrapMaybe } from "./types";

/** A single comment by id, or `null` if it doesn't exist / RLS hides it. */
export async function getCommentById(db: Db, commentId: string): Promise<Comment | null> {
  const result = await db
    .from("comments")
    .select("*")
    .eq("id", commentId)
    .is("deleted_at", null)
    .maybeSingle();
  const row = unwrapMaybe("getCommentById", result);
  return row ? toComment(row) : null;
}

export async function createComment(
  db: Db,
  authorId: string,
  input: CreateCommentInput,
): Promise<Comment> {
  const result = await db
    .from("comments")
    .insert({
      wave_id: input.wave_id,
      author_id: authorId,
      body: input.body,
      parent_comment_id: input.parent_comment_id,
    })
    .select("*")
    .single();
  return toComment(unwrap("createComment", result));
}

/** Only the author (or the Wave's creator, per RLS) may edit a comment. */
export async function updateComment(db: Db, input: UpdateCommentInput): Promise<Comment> {
  const result = await db
    .from("comments")
    .update({ body: input.body })
    .eq("id", input.comment_id)
    .select("*")
    .single();
  return toComment(unwrap("updateComment", result));
}

/** Soft delete: preserves reply threads and the counter trigger's history. */
export async function deleteComment(db: Db, commentId: string): Promise<void> {
  const result = await db
    .from("comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId);
  if (result.error) {
    throw result.error;
  }
}

/** Root-level comments on a Wave, newest first. */
export async function listWaveComments(
  db: Db,
  waveId: string,
  params: { limit?: number; cursor?: string | null } = {},
): Promise<Page<Comment>> {
  const limit = clampLimit(params.limit);
  let query = db
    .from("comments")
    .select("*")
    .eq("wave_id", waveId)
    .is("parent_comment_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (params.cursor) {
    query = query.or(keysetFilter("created_at", "id", decodeCursor(params.cursor)));
  }
  const result = await query;
  const rows = unwrap("listWaveComments", { data: result.data ?? [], error: result.error });
  const page = buildPage(rows, limit, (r) => encodeCursor(r.created_at, r.id));
  return { items: page.items.map(toComment), nextCursor: page.nextCursor };
}

/** Replies to one root comment, oldest first (reads as a conversation). */
export async function listCommentReplies(
  db: Db,
  parentCommentId: string,
  params: { limit?: number; cursor?: string | null } = {},
): Promise<Page<Comment>> {
  const limit = clampLimit(params.limit);
  let query = db
    .from("comments")
    .select("*")
    .eq("parent_comment_id", parentCommentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit + 1);
  if (params.cursor) {
    query = query.or(keysetFilter("created_at", "id", decodeCursor(params.cursor), "asc"));
  }
  const result = await query;
  const rows = unwrap("listCommentReplies", { data: result.data ?? [], error: result.error });
  const page = buildPage(rows, limit, (r) => encodeCursor(r.created_at, r.id));
  return { items: page.items.map(toComment), nextCursor: page.nextCursor };
}

/**
 * Profile → Content → "Commented Waves" (spec §25): the Waves `authorId` has
 * left a comment on, most-recently-commented first. Paginates over the
 * caller's own comments (RLS `comments_select` — `can_view_wave` — already
 * hides anything the caller can no longer see) and dedupes by Wave within the
 * page, mirroring `listSavedWaves`'s two-step shape (`saves.ts`). A Wave
 * commented on more than once still only appears once per page; its position
 * reflects the most recent of those comments.
 */
export async function listCommentedWaves(
  db: Db,
  authorId: string,
  params: { limit?: number; cursor?: string | null } = {},
): Promise<Page<Wave>> {
  const limit = clampLimit(params.limit);
  let query = db
    .from("comments")
    .select("id, wave_id, created_at")
    .eq("author_id", authorId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (params.cursor) {
    query = query.or(keysetFilter("created_at", "id", decodeCursor(params.cursor)));
  }
  const result = await query;
  const rows = unwrap("listCommentedWaves", { data: result.data ?? [], error: result.error });
  const page = buildPage(rows, limit, (r) => encodeCursor(r.created_at, r.id));

  const seen = new Set<string>();
  const orderedWaveIds: string[] = [];
  for (const row of page.items) {
    if (!seen.has(row.wave_id)) {
      seen.add(row.wave_id);
      orderedWaveIds.push(row.wave_id);
    }
  }
  if (orderedWaveIds.length === 0) {
    return { items: [], nextCursor: page.nextCursor };
  }

  const wavesResult = await db.from("waves").select("*").in("id", orderedWaveIds).is("deleted_at", null);
  const waveRows = unwrap("listCommentedWaves:waves", {
    data: wavesResult.data ?? [],
    error: wavesResult.error,
  });
  const byId = new Map(waveRows.map((w) => [w.id, toWave(w)]));
  const items = orderedWaveIds.map((id) => byId.get(id)).filter((w): w is Wave => w !== undefined);
  return { items, nextCursor: page.nextCursor };
}
