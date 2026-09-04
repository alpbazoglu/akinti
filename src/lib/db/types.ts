import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import type { Page } from "@/types/domain";

/**
 * Every helper in `src/lib/db` takes the Supabase client as its first
 * argument rather than importing one. That keeps them usable from a Server
 * Component, a Route Handler, a Server Function and the worker without any of
 * them guessing which auth context they are in — and makes them trivial to
 * test against a client stubbed for a specific user.
 */
export type Db = SupabaseClient<Database>;

/** Thrown when Postgres (or RLS) rejects an operation. */
export class DatabaseError extends Error {
  readonly code: string | null;
  readonly details: string | null;
  readonly hint: string | null;

  constructor(operation: string, error: PostgrestError) {
    super(`${operation} failed: ${error.message}`);
    this.name = "DatabaseError";
    this.code = error.code ?? null;
    this.details = error.details ?? null;
    this.hint = error.hint ?? null;
  }
}

/** Thrown when a row is missing, or hidden from the caller by RLS. */
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

/** Thrown when the caller is authenticated but not permitted. */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Unwrap a Supabase result, converting an error into a typed exception.
 *
 * RLS denial and "row does not exist" are deliberately indistinguishable here:
 * telling a caller that a private Wave exists but is off-limits is itself a
 * leak (spec s21).
 */
export function unwrap<T>(
  operation: string,
  result: { data: T | null; error: PostgrestError | null },
): T {
  if (result.error) {
    throw new DatabaseError(operation, result.error);
  }
  if (result.data === null) {
    throw new NotFoundError(operation);
  }
  return result.data;
}

/** Same as `unwrap`, but a missing row yields `null` instead of throwing. */
export function unwrapMaybe<T>(
  operation: string,
  result: { data: T | null; error: PostgrestError | null },
): T | null {
  if (result.error) {
    // PGRST116 = "no rows returned" from `.single()`.
    if (result.error.code === "PGRST116") {
      return null;
    }
    throw new DatabaseError(operation, result.error);
  }
  return result.data;
}

/** Unwrap a list result, treating `null` as an empty list. */
export function unwrapList<T>(
  operation: string,
  result: { data: T[] | null; error: PostgrestError | null },
): T[] {
  if (result.error) {
    throw new DatabaseError(operation, result.error);
  }
  return result.data ?? [];
}

/** Default page size for cursor-paginated list helpers. Mirrors `common.ts`. */
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 50;

export function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) {
    return DEFAULT_PAGE_LIMIT;
  }
  return Math.max(1, Math.min(Math.trunc(limit), MAX_PAGE_LIMIT));
}

/**
 * Turn a `limit + 1` overfetch into a `Page<T>`.
 *
 * Every cursor-paginated list helper fetches one extra row ordered by a
 * monotonic timestamp column. If the extra row is present, the list continues
 * and `nextCursor` is that column's value on the last item actually returned.
 */
export function buildPage<T>(rows: T[], limit: number, cursorOf: (row: T) => string): Page<T> {
  if (rows.length > limit) {
    const items = rows.slice(0, limit);
    return { items, nextCursor: cursorOf(items[items.length - 1]) };
  }
  return { items: rows, nextCursor: null };
}

/* ------------------------------------------------------------------------ */
/* Composite (timestamp, id) keyset cursors                                 */
/* ------------------------------------------------------------------------ */

/**
 * A decoded keyset cursor: the ordering timestamp, plus the tiebreaker column
 * value on that same row (`null` for a cursor encoded before the tiebreak
 * existed — see `decodeCursor`).
 */
export interface DecodedCursor {
  ts: string;
  id: string | null;
}

/**
 * Encode a `(timestamp, id)` keyset cursor as the opaque string handed back
 * to callers as `Page.nextCursor`.
 *
 * Every list helper here paginates on a timestamp column that is NOT unique
 * (`published_at`, `created_at`, `updated_at`, ...) — two rows created in the
 * same millisecond are possible, and previously the cursor's `.lt(column,
 * cursor)` filter silently skipped or duplicated whichever of a tied pair
 * landed on the boundary between two pages. Appending the row's own id (or
 * another column that is unique for the query, e.g. `saves.wave_id` scoped to
 * one saver) as a tiebreaker makes the keyset total, not just monotonic.
 *
 * The encoding is `<ts>_<id>` — an ISO 8601 timestamp never contains `_`, so
 * splitting on the first `_` unambiguously separates the two halves.
 */
export function encodeCursor(ts: string, id: string): string {
  return `${ts}_${id}`;
}

/**
 * Decode a cursor produced by `encodeCursor`, or a bare timestamp — the
 * format every cursor was before the id tiebreak. A pre-existing bookmarked
 * URL or cached client with an old cursor must keep working: `id` decodes to
 * `null` for that shape, and `keysetFilter` falls back to a timestamp-only
 * comparison for it.
 */
export function decodeCursor(raw: string): DecodedCursor {
  const separator = raw.indexOf("_");
  if (separator === -1) {
    return { ts: raw, id: null };
  }
  const ts = raw.slice(0, separator);
  const id = raw.slice(separator + 1);
  if (!ts || !id) {
    return { ts: raw, id: null };
  }
  return { ts, id };
}

/**
 * Build the PostgREST `.or()` expression for a `(column desc, idColumn desc)`
 * (or, with `direction: "asc"`, ascending) composite keyset page boundary:
 * `column < cursor.ts OR (column = cursor.ts AND idColumn < cursor.id)`.
 *
 * Falls back to a plain `column <op> cursor.ts` filter when `cursor.id` is
 * `null` (a pre-tiebreak cursor, see `decodeCursor`) — correct but not
 * tie-safe, matching this codebase's previous behavior for that one page.
 */
export function keysetFilter(
  column: string,
  idColumn: string,
  cursor: DecodedCursor,
  direction: "asc" | "desc" = "desc",
): string {
  const op = direction === "desc" ? "lt" : "gt";
  if (!cursor.id) {
    return `${column}.${op}.${cursor.ts}`;
  }
  return `${column}.${op}.${cursor.ts},and(${column}.eq.${cursor.ts},${idColumn}.${op}.${cursor.id})`;
}
