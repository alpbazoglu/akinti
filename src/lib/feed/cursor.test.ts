import { describe, expect, it } from "vitest";

import { decodeOffsetCursor, encodeOffsetCursor, nextOffsetCursor } from "./cursor";

describe("offset cursor codec", () => {
  it("round-trips a positive offset", () => {
    expect(decodeOffsetCursor(encodeOffsetCursor(40))).toBe(40);
  });

  it("round-trips zero", () => {
    expect(decodeOffsetCursor(encodeOffsetCursor(0))).toBe(0);
  });

  it("decodes null/undefined/empty to 0", () => {
    expect(decodeOffsetCursor(null)).toBe(0);
    expect(decodeOffsetCursor(undefined)).toBe(0);
    expect(decodeOffsetCursor("")).toBe(0);
  });

  it("decodes garbage input to 0 instead of throwing", () => {
    expect(decodeOffsetCursor("not-a-real-cursor")).toBe(0);
    expect(decodeOffsetCursor("!!!")).toBe(0);
  });

  it("decodes a tampered payload with a non-numeric offset to 0", () => {
    const tampered = Buffer.from(JSON.stringify({ o: "forty" }), "utf8").toString("base64url");
    expect(decodeOffsetCursor(tampered)).toBe(0);
  });

  it("clamps a negative offset to 0 when encoding", () => {
    expect(decodeOffsetCursor(encodeOffsetCursor(-5))).toBe(0);
  });

  it("truncates a fractional offset", () => {
    expect(decodeOffsetCursor(encodeOffsetCursor(12.9))).toBe(12);
  });

  it("never produces the same string for different offsets", () => {
    expect(encodeOffsetCursor(0)).not.toBe(encodeOffsetCursor(20));
  });
});

describe("nextOffsetCursor", () => {
  it("returns null once the source reports no more rows", () => {
    expect(nextOffsetCursor(0, 20, false)).toBeNull();
  });

  it("advances by the number of rows the page actually returned", () => {
    const next = nextOffsetCursor(20, 20, true);
    expect(decodeOffsetCursor(next)).toBe(40);
  });

  it("advances correctly from a non-zero starting offset with a short final page", () => {
    const next = nextOffsetCursor(40, 7, true);
    expect(decodeOffsetCursor(next)).toBe(47);
  });
});
