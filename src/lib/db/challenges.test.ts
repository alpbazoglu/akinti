import { describe, expect, it } from "vitest";

import {
  decodeChallengeCursor,
  deriveChallengePhase,
  encodeChallengeCursor,
} from "./challenges";

describe("encodeChallengeCursor / decodeChallengeCursor", () => {
  it("round-trips a value and id", () => {
    const value = "2026-09-05T00:00:00.000Z";
    const id = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    expect(decodeChallengeCursor(encodeChallengeCursor(value, id))).toEqual({ value, id });
  });

  it("keeps the id half exactly as encoded, including hyphens", () => {
    const decoded = decodeChallengeCursor(
      encodeChallengeCursor("2026-01-01T00:00:00.000Z", "00000000-0000-0000-0000-000000000001"),
    );
    expect(decoded).toEqual({
      value: "2026-01-01T00:00:00.000Z",
      id: "00000000-0000-0000-0000-000000000001",
    });
  });

  it("returns null for a cursor with no separator", () => {
    expect(decodeChallengeCursor("not-a-cursor")).toBeNull();
  });

  it("returns null when either half is empty", () => {
    expect(decodeChallengeCursor("|missing-value")).toBeNull();
    expect(decodeChallengeCursor("missing-id|")).toBeNull();
  });

  it("never produces the same string for different (value, id) pairs", () => {
    const a = encodeChallengeCursor("2026-01-01T00:00:00.000Z", "id-a");
    const b = encodeChallengeCursor("2026-01-01T00:00:00.000Z", "id-b");
    expect(a).not.toBe(b);
  });
});

describe("deriveChallengePhase", () => {
  const startsAt = "2026-09-01T00:00:00.000Z";
  const endsAt = "2026-09-08T00:00:00.000Z";

  it("is upcoming before starts_at", () => {
    expect(deriveChallengePhase({ startsAt, endsAt }, new Date("2026-08-31T23:59:59.000Z"))).toBe(
      "upcoming",
    );
  });

  it("is active at starts_at (inclusive)", () => {
    expect(deriveChallengePhase({ startsAt, endsAt }, new Date(startsAt))).toBe("active");
  });

  it("is active just before ends_at", () => {
    expect(deriveChallengePhase({ startsAt, endsAt }, new Date("2026-09-07T23:59:59.999Z"))).toBe(
      "active",
    );
  });

  it("is ended at ends_at (exclusive)", () => {
    expect(deriveChallengePhase({ startsAt, endsAt }, new Date(endsAt))).toBe("ended");
  });

  it("is ended well after ends_at", () => {
    expect(deriveChallengePhase({ startsAt, endsAt }, new Date("2026-10-01T00:00:00.000Z"))).toBe(
      "ended",
    );
  });
});
