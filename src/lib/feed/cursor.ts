/**
 * Cursor codec for the one score-ordered Explore lane: Trending.
 *
 * Every timestamp-ordered list in the app (`listHomeFeed`, `listNewWaves`,
 * `listOriginalWaves`, ...) already paginates with a plain ISO
 * `published_at` string as its cursor (`Page<T>.nextCursor`,
 * `src/lib/db/types.ts#buildPage`) — that contract is shared with every other
 * domain agent and stays untouched here.
 *
 * `trending_waves` (migration 14) is ordered by a computed score, not a
 * column, so it paginates by `offset` instead. `ExploreView`
 * (`src/components/feed`) treats every category's cursor as an opaque string
 * either way — this module is what the Trending lane uses to encode "how
 * many rows already loaded" into that string, so the client never has to
 * know a category's pagination strategy.
 */

export interface OffsetCursor {
  offset: number;
}

/** Encode a page offset into an opaque cursor string. */
export function encodeOffsetCursor(offset: number): string {
  const safe = Number.isFinite(offset) && offset > 0 ? Math.trunc(offset) : 0;
  return Buffer.from(JSON.stringify({ o: safe }), "utf8").toString("base64url");
}

/**
 * Decode an offset cursor. Never throws: a missing, foreign, or corrupted
 * cursor decodes to `0` (start over) rather than failing the request — a
 * stale/garbled cursor is a paging inconvenience, not an error worth a 500.
 */
export function decodeOffsetCursor(cursor: string | null | undefined): number {
  if (!cursor) {
    return 0;
  }
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { o?: unknown };
    if (typeof parsed.o === "number" && Number.isFinite(parsed.o) && parsed.o >= 0) {
      return Math.trunc(parsed.o);
    }
    return 0;
  } catch {
    return 0;
  }
}

/** Build the next page's cursor from the current offset and how many rows this page fetched. */
export function nextOffsetCursor(currentOffset: number, pageItemCount: number, hasMore: boolean): string | null {
  if (!hasMore) {
    return null;
  }
  return encodeOffsetCursor(currentOffset + pageItemCount);
}
