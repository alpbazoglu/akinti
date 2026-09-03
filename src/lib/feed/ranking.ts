/**
 * Explore ranking (spec s10): a deterministic, explainable, time-decayed
 * weighted score — no ML in v1. This module is a pure TypeScript mirror of
 * `public.wave_trending_score()` (migration `20260903121400_search.sql`),
 * kept in sync by hand and pinned by `ranking.test.ts` fixture cases.
 *
 * Nothing in the app actually calls `waveTrendingScore` to rank a live feed —
 * `src/lib/db/waves.ts#listTrendingWaves` calls the `trending_waves` RPC,
 * which evaluates the real SQL function against live counters so ranking
 * never drifts from what a client last read. This file exists so the formula
 * is: (a) unit-testable without a database, (b) documented in one place
 * outside a SQL string, and (c) swappable — `RankingScorer` is the seam a
 * future recommender implements instead, without any call site needing to
 * change (spec s10: "ranking as a separate, swappable scoring function").
 */

export interface WaveEngagementInput {
  playCount: number;
  replayCount: number;
  saveCount: number;
  commentCount: number;
  shareCount: number;
  duetCount: number;
  /** ISO timestamp or `Date`. */
  publishedAt: string | Date;
}

/**
 * Weights, in one place (spec s10). Duets are worth the most because
 * collaboration — not passive consumption — is the product's differentiation
 * goal (spec s48); Saves and Comments outweigh a bare Play because they are
 * deliberate, not just "audio reached the viewport" (spec s13).
 */
export const RANKING_WEIGHTS = {
  play: 1.0,
  replay: 3.0,
  save: 4.0,
  comment: 5.0,
  share: 6.0,
  duet: 12.0,
} as const;

/** Matches the SQL function's `power(2.0, ageDays / 2.0)` decay exactly. */
export const FRESHNESS_HALF_LIFE_HOURS = 48;

/** A scoring strategy: engagement + freshness in, a sortable number out. */
export interface RankingScorer {
  score(input: WaveEngagementInput, now?: Date): number;
}

/**
 * `public.wave_trending_score()`, verbatim in TypeScript:
 *
 * ```sql
 * (plays*1 + replays*3 + saves*4 + comments*5 + shares*6 + duets*12)
 *   / power(2.0, greatest(0, age_days) / 2.0)
 * ```
 */
export function waveTrendingScore(input: WaveEngagementInput, now: Date = new Date()): number {
  const weighted =
    input.playCount * RANKING_WEIGHTS.play +
    input.replayCount * RANKING_WEIGHTS.replay +
    input.saveCount * RANKING_WEIGHTS.save +
    input.commentCount * RANKING_WEIGHTS.comment +
    input.shareCount * RANKING_WEIGHTS.share +
    input.duetCount * RANKING_WEIGHTS.duet;

  const publishedAt = typeof input.publishedAt === "string" ? new Date(input.publishedAt) : input.publishedAt;
  const ageDays = Math.max(0, (now.getTime() - publishedAt.getTime()) / 86_400_000);
  const halfLives = ageDays / (FRESHNESS_HALF_LIFE_HOURS / 24);

  return weighted / Math.pow(2, halfLives);
}

/** The default, deterministic scorer. Swap this binding for a real recommender later. */
export const defaultRankingScorer: RankingScorer = {
  score: (input, now) => waveTrendingScore(input, now),
};
