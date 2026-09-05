/**
 * The genre tint (`docs/design/COLOR_V2.md` "Colour by mode and genre":
 * "Genre tints for the idle trace ... on Explore lanes and profile
 * signature" / "Profile signature trace: the creator's dominant genre
 * tint").
 *
 * Neither `Profile` nor `Wave` carries a dedicated `genre` field
 * (`src/types/domain.ts`) — the closest thing on the schema is `Wave.tags`,
 * a free-text hashtag list. So "genre" here means: look at the tags across
 * a creator's own recent Waves (the same set their signature is composed
 * from), find the one used most often, and map it to a fixed hue if it
 * names a recognised genre. Anything unrecognised, or no tags at all,
 * falls through to the current — genre tinting is optional and subtle by
 * design (COLOR_V2), never a guess dressed up as a fact.
 */

import type { TraceHue } from "@/components/audio";

export type GenreHue = Extract<TraceHue, `genre-${string}`>;

/**
 * Keyword match, case-insensitive substring, checked in this order so a
 * more specific term (e.g. "hip-hop") does not get shadowed by a shorter
 * one. First match wins.
 */
const GENRE_KEYWORDS: ReadonlyArray<readonly [GenreHue, readonly string[]]> = [
  ["genre-rap", ["hip-hop", "hiphop", "trap", "rap"]],
  ["genre-arabesk", ["arabesk"]],
  ["genre-turku", ["türkü", "turku", "halk", "folk"]],
  ["genre-rock", ["rock", "metal"]],
  ["genre-pop", ["pop"]],
];

/**
 * The most-used tag across one or more tag lists (typically one per Wave),
 * lower-cased and trimmed. `null` when there are no non-empty tags at all.
 * Ties keep whichever tag was encountered first, so the result is stable
 * for a fixed input order (newest Wave first, matching the signature's own
 * ordering).
 */
export function mostUsedTag(tagLists: readonly (readonly string[])[]): string | null {
  const counts = new Map<string, number>();
  for (const tags of tagLists) {
    for (const raw of tags) {
      const tag = raw.trim().toLowerCase();
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [tag, count] of counts) {
    if (count > bestCount) {
      best = tag;
      bestCount = count;
    }
  }
  return best;
}

/** Maps one tag to a genre hue, or `undefined` when it names no recognised genre. */
export function genreHueForTag(tag: string | null): GenreHue | undefined {
  if (!tag) return undefined;
  const normalized = tag.trim().toLowerCase();
  if (!normalized) return undefined;
  for (const [hue, keywords] of GENRE_KEYWORDS) {
    if (keywords.some((keyword) => normalized.includes(keyword))) return hue;
  }
  return undefined;
}

/**
 * The full derivation: most-used tag across `tagLists`, mapped to a genre
 * hue. `undefined` means "no genre tint" — the caller should draw the trace
 * in the plain current rather than pass a hue at all.
 */
export function deriveGenreHue(tagLists: readonly (readonly string[])[]): GenreHue | undefined {
  return genreHueForTag(mostUsedTag(tagLists));
}
