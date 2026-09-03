import { describe, expect, it } from "vitest";

import { FRESHNESS_HALF_LIFE_HOURS, RANKING_WEIGHTS, defaultRankingScorer, waveTrendingScore } from "./ranking";

const NOW = new Date("2026-09-03T00:00:00.000Z");

describe("waveTrendingScore", () => {
  it("scores a fresh Wave with no engagement at zero", () => {
    expect(
      waveTrendingScore(
        {
          playCount: 0,
          replayCount: 0,
          saveCount: 0,
          commentCount: 0,
          shareCount: 0,
          duetCount: 0,
          publishedAt: NOW,
        },
        NOW,
      ),
    ).toBe(0);
  });

  it("weights a single event by its configured weight at zero age", () => {
    const base = {
      playCount: 0,
      replayCount: 0,
      saveCount: 0,
      commentCount: 0,
      shareCount: 0,
      duetCount: 0,
      publishedAt: NOW,
    };
    expect(waveTrendingScore({ ...base, playCount: 1 }, NOW)).toBeCloseTo(RANKING_WEIGHTS.play, 10);
    expect(waveTrendingScore({ ...base, replayCount: 1 }, NOW)).toBeCloseTo(RANKING_WEIGHTS.replay, 10);
    expect(waveTrendingScore({ ...base, saveCount: 1 }, NOW)).toBeCloseTo(RANKING_WEIGHTS.save, 10);
    expect(waveTrendingScore({ ...base, commentCount: 1 }, NOW)).toBeCloseTo(RANKING_WEIGHTS.comment, 10);
    expect(waveTrendingScore({ ...base, shareCount: 1 }, NOW)).toBeCloseTo(RANKING_WEIGHTS.share, 10);
    expect(waveTrendingScore({ ...base, duetCount: 1 }, NOW)).toBeCloseTo(RANKING_WEIGHTS.duet, 10);
  });

  it("sums weighted engagement linearly", () => {
    const score = waveTrendingScore(
      {
        playCount: 100,
        replayCount: 10,
        saveCount: 5,
        commentCount: 4,
        shareCount: 2,
        duetCount: 1,
        publishedAt: NOW,
      },
      NOW,
    );
    const expected =
      100 * RANKING_WEIGHTS.play +
      10 * RANKING_WEIGHTS.replay +
      5 * RANKING_WEIGHTS.save +
      4 * RANKING_WEIGHTS.comment +
      2 * RANKING_WEIGHTS.share +
      1 * RANKING_WEIGHTS.duet;
    expect(score).toBeCloseTo(expected, 10);
  });

  it("halves the score once per half-life window", () => {
    const engagement = {
      playCount: 100,
      replayCount: 0,
      saveCount: 0,
      commentCount: 0,
      shareCount: 0,
      duetCount: 0,
    };
    const fresh = waveTrendingScore({ ...engagement, publishedAt: NOW }, NOW);
    const oneHalfLifeAgo = new Date(NOW.getTime() - FRESHNESS_HALF_LIFE_HOURS * 60 * 60 * 1000);
    const decayed = waveTrendingScore({ ...engagement, publishedAt: oneHalfLifeAgo }, NOW);
    expect(decayed).toBeCloseTo(fresh / 2, 6);

    const twoHalfLivesAgo = new Date(NOW.getTime() - 2 * FRESHNESS_HALF_LIFE_HOURS * 60 * 60 * 1000);
    const decayedTwice = waveTrendingScore({ ...engagement, publishedAt: twoHalfLivesAgo }, NOW);
    expect(decayedTwice).toBeCloseTo(fresh / 4, 6);
  });

  it("never decays below zero age for a Wave published in the future (clock skew)", () => {
    const future = new Date(NOW.getTime() + 60_000);
    const score = waveTrendingScore(
      {
        playCount: 10,
        replayCount: 0,
        saveCount: 0,
        commentCount: 0,
        shareCount: 0,
        duetCount: 0,
        publishedAt: future,
      },
      NOW,
    );
    expect(score).toBeCloseTo(10 * RANKING_WEIGHTS.play, 10);
  });

  it("accepts an ISO string for publishedAt, identically to a Date", () => {
    const iso = NOW.toISOString();
    const fromString = waveTrendingScore(
      { playCount: 3, replayCount: 0, saveCount: 0, commentCount: 0, shareCount: 0, duetCount: 0, publishedAt: iso },
      NOW,
    );
    const fromDate = waveTrendingScore(
      { playCount: 3, replayCount: 0, saveCount: 0, commentCount: 0, shareCount: 0, duetCount: 0, publishedAt: NOW },
      NOW,
    );
    expect(fromString).toBe(fromDate);
  });

  it("orders a highly-engaged older Wave below a fresher, lightly-engaged one once decay dominates", () => {
    const old = waveTrendingScore(
      {
        playCount: 50,
        replayCount: 0,
        saveCount: 0,
        commentCount: 0,
        shareCount: 0,
        duetCount: 0,
        publishedAt: new Date(NOW.getTime() - 10 * FRESHNESS_HALF_LIFE_HOURS * 60 * 60 * 1000),
      },
      NOW,
    );
    const fresh = waveTrendingScore(
      {
        playCount: 5,
        replayCount: 0,
        saveCount: 0,
        commentCount: 0,
        shareCount: 0,
        duetCount: 0,
        publishedAt: NOW,
      },
      NOW,
    );
    expect(fresh).toBeGreaterThan(old);
  });
});

describe("defaultRankingScorer", () => {
  it("delegates to waveTrendingScore", () => {
    const input = {
      playCount: 1,
      replayCount: 0,
      saveCount: 0,
      commentCount: 0,
      shareCount: 0,
      duetCount: 0,
      publishedAt: NOW,
    };
    expect(defaultRankingScorer.score(input, NOW)).toBe(waveTrendingScore(input, NOW));
  });
});
