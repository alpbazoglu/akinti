import { describe, expect, it } from "vitest";

import {
  ACCENT_PRESETS,
  BACKGROUND_PRESETS,
  READABLE_DARK,
  READABLE_LIGHT,
  contrastRatio,
  hexToRgb,
  meetsAA,
  pickReadableForeground,
  relativeLuminance,
  resolveProfileTheme,
} from "./profileTheme";

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

describe("pickReadableForeground", () => {
  it("picks the dark readable color for a light background", () => {
    expect(pickReadableForeground("#f5f6f8")).toBe(READABLE_DARK);
  });

  it("picks the light readable color for a dark background", () => {
    expect(pickReadableForeground("#0a0c0f")).toBe(READABLE_LIGHT);
  });

  it("always clears AA against the background it was chosen for", () => {
    const samples = ["#ffffff", "#000000", "#808080", "#0e7c86", "#cbb996", "#48505c"];
    for (const bg of samples) {
      const fg = pickReadableForeground(bg);
      expect(meetsAA(bg, fg)).toBe(true);
    }
  });
});

describe("curated presets are AA-safe by construction", () => {
  it("every background preset pairs with a readable foreground at AA", () => {
    for (const preset of Object.values(BACKGROUND_PRESETS)) {
      const fg = pickReadableForeground(preset.hex);
      expect(meetsAA(preset.hex, fg)).toBe(true);
    }
  });

  it("every accent preset pairs with a readable foreground at AA", () => {
    for (const preset of Object.values(ACCENT_PRESETS)) {
      const fg = pickReadableForeground(preset.hex);
      expect(meetsAA(preset.hex, fg)).toBe(true);
    }
  });
});

describe("resolveProfileTheme", () => {
  it("resolves every preset id and exposes an AA-safe banner foreground", () => {
    const resolved = resolveProfileTheme({
      backgroundColor: "plum",
      backgroundGradient: "dusk",
      backgroundPattern: "rings",
      accent: "rose",
    });

    expect(resolved.background.id).toBe("plum");
    expect(resolved.gradient.id).toBe("dusk");
    expect(resolved.pattern.id).toBe("rings");
    expect(resolved.accent.id).toBe("rose");
    expect(meetsAA(resolved.background.hex, resolved.bannerForeground)).toBe(true);
    expect(meetsAA(resolved.accent.hex, resolved.accentForeground)).toBe(true);
    expect(resolved.style["--profile-banner-bg"]).toBe(resolved.background.hex);
  });

  it("resolves 'none' gradient/pattern to a plain background with no extra image layers", () => {
    const resolved = resolveProfileTheme({
      backgroundColor: "ink",
      backgroundGradient: "none",
      backgroundPattern: "none",
      accent: "aqua",
    });

    expect(resolved.style["--profile-banner-image"]).toBe("none");
  });

  it("layers gradient and pattern together when both are set", () => {
    const resolved = resolveProfileTheme({
      backgroundColor: "forest",
      backgroundGradient: "aurora",
      backgroundPattern: "dots",
      accent: "emerald",
    });

    const image = resolved.style["--profile-banner-image"];
    expect(image).not.toBe("none");
    expect(image).toContain("linear-gradient");
    expect(image).toContain("radial-gradient");
  });
});
