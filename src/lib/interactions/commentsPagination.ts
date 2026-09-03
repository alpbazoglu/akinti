/**
 * Merge a newly-loaded cursor page of comments (or replies) into the list
 * already on screen, deduping by `id`.
 *
 * A dedupe pass is needed because a comment can legitimately arrive twice:
 * "Load more" re-requests from a cursor that hasn't moved yet (a fast
 * double-click), or a new root comment lands between two "Load more" calls
 * and shifts the `created_at` ordering underneath a `lt("created_at", ...)`
 * cursor. Keeping the *first* occurrence (rather than the incoming one)
 * matters for the composer's own optimistic insert: the just-posted comment
 * is prepended locally immediately, and must not be clobbered by a slightly
 * different copy of itself coming back from a subsequent page load.
 */
export function mergeCommentPage<T extends { id: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const seen = new Set(existing.map((item) => item.id));
  const merged = existing.slice();
  for (const item of incoming) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

/** Prepend a freshly-created comment, guarding against a duplicate id (e.g. a retried submit). */
export function prependComment<T extends { id: string }>(existing: readonly T[], created: T): T[] {
  if (existing.some((item) => item.id === created.id)) {
    return existing.slice();
  }
  return [created, ...existing];
}

/** Remove a comment locally after a successful delete, by id. */
export function removeComment<T extends { id: string }>(existing: readonly T[], id: string): T[] {
  return existing.filter((item) => item.id !== id);
}
