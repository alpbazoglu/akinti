import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor, keysetFilter } from "./types";

describe("encodeCursor / decodeCursor", () => {
  it("round-trips a timestamp and id", () => {
    const ts = "2026-09-04T10:23:45.678Z";
    const id = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    expect(decodeCursor(encodeCursor(ts, id))).toEqual({ ts, id });
  });

  it("decodes a bare timestamp (pre-tiebreak cursor) with a null id", () => {
    const ts = "2026-09-04T10:23:45.678Z";
    expect(decodeCursor(ts)).toEqual({ ts, id: null });
  });

  it("keeps the id half exactly as encoded, including hyphens", () => {
    const decoded = decodeCursor(encodeCursor("2026-01-01T00:00:00.000Z", "00000000-0000-0000-0000-000000000001"));
    expect(decoded.id).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("splits on the first underscore, so a non-uuid tiebreaker with none works too", () => {
    expect(decodeCursor(encodeCursor("2026-01-01T00:00:00.000Z", "wave-123"))).toEqual({
      ts: "2026-01-01T00:00:00.000Z",
      id: "wave-123",
    });
  });

  it("falls back to a null id for malformed input with a trailing separator", () => {
    expect(decodeCursor("2026-01-01T00:00:00.000Z_")).toEqual({
      ts: "2026-01-01T00:00:00.000Z_",
      id: null,
    });
  });

  it("never produces the same string for different (ts, id) pairs", () => {
    const a = encodeCursor("2026-01-01T00:00:00.000Z", "id-a");
    const b = encodeCursor("2026-01-01T00:00:00.000Z", "id-b");
    expect(a).not.toBe(b);
  });
});

describe("keysetFilter", () => {
  const ts = "2026-09-04T10:00:00.000Z";
  const id = "id-1";

  it("builds a descending tie-safe OR expression when the cursor has an id", () => {
    expect(keysetFilter("published_at", "id", { ts, id })).toBe(
      `published_at.lt.${ts},and(published_at.eq.${ts},id.lt.${id})`,
    );
  });

  it("builds an ascending tie-safe OR expression for direction: asc", () => {
    expect(keysetFilter("created_at", "id", { ts, id }, "asc")).toBe(
      `created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${id})`.replace(/lt/g, "gt"),
    );
  });

  it("falls back to a plain comparison when the cursor has no id (pre-tiebreak)", () => {
    expect(keysetFilter("published_at", "id", { ts, id: null })).toBe(`published_at.lt.${ts}`);
  });

  it("falls back to a plain gt comparison for asc direction with no id", () => {
    expect(keysetFilter("created_at", "id", { ts, id: null }, "asc")).toBe(`created_at.gt.${ts}`);
  });

  it("uses the given tiebreaker column name, not a hardcoded 'id'", () => {
    expect(keysetFilter("created_at", "wave_id", { ts, id: "w-1" })).toBe(
      `created_at.lt.${ts},and(created_at.eq.${ts},wave_id.lt.w-1)`,
    );
  });
});
