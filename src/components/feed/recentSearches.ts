/**
 * Recent searches (SCREENS.md §4).
 *
 * A short, local memory of what this reader looked for, so the empty search
 * screen has something real on it instead of an instruction. It lives in
 * `localStorage` and never leaves the device: a search history is not
 * something this product wants on a server.
 *
 * The list logic is pure and lives here so it can be tested without a browser.
 */

export const RECENT_SEARCHES_KEY = "akinti.recent-searches";

/** How many searches are remembered. Four fits above the fold at 390px. */
export const MAX_RECENT_SEARCHES = 6;

/**
 * Put `query` at the front, remove any case-insensitive duplicate of it, and
 * cap the list. Blank queries are ignored rather than stored as an entry
 * nobody can click.
 */
export function withRecentSearch(
  existing: readonly string[],
  query: string,
  max: number = MAX_RECENT_SEARCHES,
): string[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return dedupe(existing, max);
  const rest = existing.filter((item) => item.trim().toLowerCase() !== trimmed.toLowerCase());
  return dedupe([trimmed, ...rest], max);
}

/** Drop `query` from the list. Used by the per-item remove control. */
export function withoutRecentSearch(existing: readonly string[], query: string): string[] {
  const target = query.trim().toLowerCase();
  return existing.filter((item) => item.trim().toLowerCase() !== target);
}

function dedupe(items: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

/** Parse a stored value, tolerating anything that is not the shape we wrote. */
export function parseRecentSearches(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupe(
      parsed.filter((item): item is string => typeof item === "string"),
      MAX_RECENT_SEARCHES,
    );
  } catch {
    return [];
  }
}

/** Read the list from a storage object. */
export function readRecentSearches(storage: Pick<Storage, "getItem"> | null): string[] {
  if (!storage) return [];
  try {
    return parseRecentSearches(storage.getItem(RECENT_SEARCHES_KEY));
  } catch {
    return [];
  }
}

/** Write the list. A storage failure is silent: this is a convenience. */
export function writeRecentSearches(
  storage: Pick<Storage, "setItem"> | null,
  items: readonly string[],
): void {
  if (!storage) return;
  try {
    storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(items.slice(0, MAX_RECENT_SEARCHES)));
  } catch {
    // Private mode, a full quota, a browser that blocks site data: the
    // history is a nicety, never a requirement.
  }
}
