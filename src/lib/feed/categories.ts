/**
 * Explore categories (spec s10): Trending, New, Rising, Original, Voices,
 * Compositions, Open for Duet.
 *
 * Trending/New/Rising/Original/Open for Duet are structural — they read
 * `waves.content_origin`, `waves.duet_permission`, `waves.published_at` or
 * the `rising_creators`/`trending_waves` RPCs directly (`src/lib/db/waves.ts`,
 * `src/lib/db/discovery.ts`). Voices and Compositions are the two categories
 * the spec asks to be derived from "tags/creation metadata" — this module is
 * that mapping, and the one place it is written down.
 *
 * The mapping is against what `CreateWaveForm` actually offers
 * (`WAVE_CATEGORY_OPTIONS`, `src/lib/audio/createDraft.ts`): Music, Talk,
 * Storytelling, Comedy, News, Education, ASMR, Other — lower-cased on write
 * by `tagsSchema` (`src/lib/validation/waves.ts`). `waves.tags` is otherwise
 * free text (up to 8 entries), so this list is deliberately the fixed
 * creation-time vocabulary, not an attempt to enumerate every tag a user
 * could type.
 *
 *   Voices       — spoken-word-centric: talk, storytelling, comedy, news, education, asmr
 *   Compositions — musical/instrumental: music
 *
 * "other" belongs to neither lane; a Wave can appear in both if it carries
 * tags from both groups (e.g. a scored spoken-word piece tagged `music` and
 * `storytelling`).
 */

export const EXPLORE_CATEGORIES = [
  "trending",
  "new",
  "rising",
  "original",
  "voices",
  "compositions",
  "open_for_duet",
] as const;

export type ExploreCategory = (typeof EXPLORE_CATEGORIES)[number];

export interface ExploreCategoryMeta {
  readonly key: ExploreCategory;
  readonly label: string;
  readonly description: string;
}

export const EXPLORE_CATEGORY_META: Readonly<Record<ExploreCategory, ExploreCategoryMeta>> = {
  trending: {
    key: "trending",
    label: "Trending",
    description: "Ranked by engagement with a 48-hour freshness half-life.",
  },
  new: {
    key: "new",
    label: "New",
    description: "The newest public Waves, most recent first.",
  },
  rising: {
    key: "rising",
    label: "Rising",
    description: "Creators with recent follower growth or a recent first Wave.",
  },
  original: {
    key: "original",
    label: "Original",
    description: "Original compositions and performances only.",
  },
  voices: {
    key: "voices",
    label: "Voices",
    description: "Spoken word: talk, storytelling, comedy, news, education, ASMR.",
  },
  compositions: {
    key: "compositions",
    label: "Compositions",
    description: "Music and instrumentals.",
  },
  open_for_duet: {
    key: "open_for_duet",
    label: "Open for Duet",
    description: "Creators currently accepting Duet Requests.",
  },
};

/** The lower-cased `waves.tags` values that count as "Voices" (spec s10). */
export const VOICE_TAGS = ["talk", "storytelling", "comedy", "news", "education", "asmr"] as const;

/** The lower-cased `waves.tags` values that count as "Compositions" (spec s10). */
export const COMPOSITION_TAGS = ["music"] as const;

/** Tag-mapped categories: the ones `listWavesByTags` (`src/lib/db/waves.ts`) can serve. */
export type TagMappedCategory = "voices" | "compositions";

export function tagsForCategory(category: TagMappedCategory): readonly string[] {
  return category === "voices" ? VOICE_TAGS : COMPOSITION_TAGS;
}

/**
 * Which tag-mapped categories a Wave's tags place it in, in category-key
 * order. A Wave with no recognised tag, or only `other`, maps to neither.
 */
export function categoriesForTags(tags: readonly string[]): TagMappedCategory[] {
  const lower = new Set(tags.map((tag) => tag.trim().toLowerCase()));
  const result: TagMappedCategory[] = [];
  if (VOICE_TAGS.some((tag) => lower.has(tag))) {
    result.push("voices");
  }
  if (COMPOSITION_TAGS.some((tag) => lower.has(tag))) {
    result.push("compositions");
  }
  return result;
}

export function isTagMappedCategory(category: ExploreCategory): category is TagMappedCategory {
  return category === "voices" || category === "compositions";
}

/**
 * Score-ordered categories paginate by offset (`src/lib/feed/cursor.ts`);
 * every other category — including Rising, whose Wave list is "the newest
 * Waves from a pool of rising creators", not the creators themselves —
 * paginates by `published_at` like every other time-ordered lane.
 */
export function isOffsetPaginatedCategory(category: ExploreCategory): boolean {
  return category === "trending";
}
