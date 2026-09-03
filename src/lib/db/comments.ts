/**
 * `comments`. Flat, with at most one level of replies (spec s14) — enforced
 * again by `comments_enforce_shallow_threading` even if a caller here got the
 * shape wrong.
 */

import type { CreateCommentInput, UpdateCommentInput } from "@/lib/validation/waves";
import type { Comment, Page } from "@/types/domain";

import { toComment } from "./mappers";
import type { Db } from "./types";
import { buildPage, clampLimit, unwrap } from "./types";

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
    .limit(limit + 1);
  if (params.cursor) {
    query = query.lt("created_at", params.cursor);
  }
  const result = await query;
  const rows = unwrap("listWaveComments", { data: result.data ?? [], error: result.error });
  const page = buildPage(rows, limit, (r) => r.created_at);
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
    .limit(limit + 1);
  if (params.cursor) {
    query = query.gt("created_at", params.cursor);
  }
  const result = await query;
  const rows = unwrap("listCommentReplies", { data: result.data ?? [], error: result.error });
  const page = buildPage(rows, limit, (r) => r.created_at);
  return { items: page.items.map(toComment), nextCursor: page.nextCursor };
}
