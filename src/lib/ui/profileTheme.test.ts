import { describe, expect, it } from "vitest";

import { contrastRatio, hexToRgb, meetsAA, relativeLuminance } from "./profileTheme";

describe("hexToRgb", () => {
  it("parses a 6-digit hex color", () => {
    expect(hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb("#0e7c86")).toEqual({ r: 14, g: 124, b: 134 });
  });

  it("expands a 3-digit shorthand", () => {
    expect(hexToRgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("throws on malformed input", () => {
    expect(() => hexToRgb("not-a-color")).toThrow();
    expect(() => hexToRgb("#gggggg")).toThrow();
  });
});

describe("relativeLuminance", () => {
  it("is 1 for white and 0 for black", () => {
    expect(relativeLuminance(hexToRgb("#ffffff"))).toBeCloseTo(1, 5);
    expect(relativeLuminance(hexToRgb("#000000"))).toBeCloseTo(0, 5);
  });

  it("is monotonic with lightness for greys", () => {
    const dark = relativeLuminance(hexToRgb("#333333"));
    const mid = relativeLuminance(hexToRgb("#888888"));
    const light = relativeLuminance(hexToRgb("#cccccc"));
    expect(dark).toBeLessThan(mid);
    expect(mid).toBeLessThan(light);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("is 1 for identical colors", () => {
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#123456", "#abcdef")).toBeCloseTo(
      contrastRatio("#abcdef", "#123456"),
      10,
    );
  });
});

describe("meetsAA", () => {
  it("passes black-on-white and fails near-identical grays", () => {
    expect(meetsAA("#ffffff", "#000000")).toBe(true);
    expect(meetsAA("#888888", "#8a8a8a")).toBe(false);
  });
});
