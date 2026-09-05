import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio, hexToRgb, relativeLuminance } from "./profileTheme";

/**
 * A regression guard on the palette itself.
 *
 * `docs/design/COLOR_V2.md` (which wins over `docs/design/DESIGN.md` §4 on
 * anything colour) sets the water palette: tinted paper, a deep-teal
 * "current" brand hue, sand, mode/genre trace hues, and Signal held
 * exclusive to live audio. `docs/design/DESIGN.md` §12 still governs shape,
 * motion and the rest of "never do". Those are review rules, and review
 * rules rot; these are the ones a machine can hold.
 *
 * Comments are stripped first: a comment naming a banned value is
 * documentation, not a declaration.
 */
const GLOBALS = readFileSync(
  path.join(process.cwd(), "src", "app", "globals.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

const LIGHT = {
  paper: "#e9efec",
  ink: "#0f1a18",
  inkMuted: "#33443f",
  inkSubtle: "#4e625c",
  signal: "#de3c11",
  current: "#0e6b6b",
  current2: "#0a4f50",
  sand: "#8c6418",
  danger: "#9a2e1e",
  atisma: "#2f6f3e",
  cypherBlue: "#3d5a99",
  // The unplayed trace on light is the current, not a grey (COLOR_V2
  // "Waveform").
  waveDormant: "#0e6b6b",
} as const;

const DARK = {
  paper: "#0f1614",
  ink: "#e6efec",
  inkMuted: "#b8c8c2",
  inkSubtle: "#8fa39c",
  signal: "#ff5c33",
  current: "#3fb5b0",
  current2: "#2b8d89",
  foam: "#3e7972",
  sand: "#e0b25a",
  danger: "#f07a62",
  atisma: "#6dbf7e",
  cypherBlue: "#8aa6e6",
  // The unplayed trace on dark is foam, not the brand current (COLOR_V2
  // "Waveform").
  waveDormant: "#3e7972",
} as const;

/** Hue angle in degrees, 0-360. Used to keep the deep-water blue on the blue
 * side of the wheel rather than drifting into violet (COLOR_V2 "Cypher"). */
function hueOf(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

describe("palette tokens", () => {
  it("defines every Gündüz value from COLOR_V2.md", () => {
    for (const hex of Object.values(LIGHT)) {
      expect(GLOBALS).toContain(hex);
    }
  });

  it("defines every Gece value from COLOR_V2.md", () => {
    for (const hex of Object.values(DARK)) {
      expect(GLOBALS).toContain(hex);
    }
  });

  it("has no indigo, violet or purple, in any shade (12.11) — the deep-water " +
    "blue is blue, not violet (COLOR_V2 'Cypher')", () => {
    expect(GLOBALS.toLowerCase()).not.toContain("indigo");
    expect(GLOBALS.toLowerCase()).not.toContain("violet");
    expect(GLOBALS.toLowerCase()).not.toContain("purple");
    for (const hex of [LIGHT.cypherBlue, DARK.cypherBlue]) {
      const hue = hueOf(hex);
      expect(hue).toBeGreaterThanOrEqual(180);
      expect(hue).toBeLessThan(225);
    }
  });

  it("does not use the generated dark ground (12.13)", () => {
    expect(GLOBALS.toLowerCase()).not.toContain("#0a0a0a");
    expect(GLOBALS).not.toMatch(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.1\s*\)/);
  });

  it("keeps Signal exclusive to live audio: no `--akinti-danger` value equals `--akinti-signal` (COLOR_V2 principle 2)", () => {
    expect(LIGHT.danger).not.toBe(LIGHT.signal);
    expect(DARK.danger).not.toBe(DARK.signal);
  });
});

describe("palette contrast", () => {
  it("meets the AA floors for light text tokens", () => {
    expect(contrastRatio(LIGHT.ink, LIGHT.paper)).toBeGreaterThanOrEqual(15);
    expect(contrastRatio(LIGHT.inkMuted, LIGHT.paper)).toBeGreaterThanOrEqual(6.5);
    expect(contrastRatio(LIGHT.inkSubtle, LIGHT.paper)).toBeGreaterThanOrEqual(4.5);
    // Links, the accent and success copy all run on the current.
    expect(contrastRatio(LIGHT.current, LIGHT.paper)).toBeGreaterThanOrEqual(4.5);
    // Sand carries text (Cypher order numerals, warning copy).
    expect(contrastRatio(LIGHT.sand, LIGHT.paper)).toBeGreaterThanOrEqual(4.5);
    // Destructive text is its own hue now, independent of Signal.
    expect(contrastRatio(LIGHT.danger, LIGHT.paper)).toBeGreaterThanOrEqual(4.5);
  });

  it("meets the AA floors for dark text tokens", () => {
    expect(contrastRatio(DARK.ink, DARK.paper)).toBeGreaterThanOrEqual(15);
    expect(contrastRatio(DARK.inkMuted, DARK.paper)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(DARK.inkSubtle, DARK.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(DARK.current, DARK.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(DARK.sand, DARK.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(DARK.danger, DARK.paper)).toBeGreaterThanOrEqual(4.5);
  });

  it("clears the 3:1 non-text threshold for Signal and the unplayed trace", () => {
    // Signal is a graphic-only token: it must be perceivable against the page
    // without ever being used for body text.
    expect(contrastRatio(LIGHT.signal, LIGHT.paper)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(DARK.signal, DARK.paper)).toBeGreaterThanOrEqual(3);
    // The unplayed trace has to read on its own: current in light, foam in
    // dark (COLOR_V2 "Waveform").
    expect(contrastRatio(LIGHT.waveDormant, LIGHT.paper)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(DARK.waveDormant, DARK.paper)).toBeGreaterThanOrEqual(3);
  });

  it("clears 3:1 for the mode/genre trace hues (COLOR_V2 'Colour by mode and genre')", () => {
    expect(contrastRatio(LIGHT.atisma, LIGHT.paper)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(DARK.atisma, DARK.paper)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(LIGHT.cypherBlue, LIGHT.paper)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(DARK.cypherBlue, DARK.paper)).toBeGreaterThanOrEqual(3);
  });

  it("keeps paper legible on a current fill (buttons and keys, COLOR_V2 'Buttons')", () => {
    expect(contrastRatio(LIGHT.paper, LIGHT.current)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(DARK.paper, DARK.current)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps `-2` the pressed/hover depth of `current`, not a different hue", () => {
    // Same direction in both themes: `current-2` is `current` pushed toward
    // ink, so a hover/press state reads as depth, not a colour swap.
    expect(relativeLuminance(hexToRgb(LIGHT.current2))).toBeLessThan(
      relativeLuminance(hexToRgb(LIGHT.current)),
    );
    expect(relativeLuminance(hexToRgb(DARK.current2))).toBeLessThan(
      relativeLuminance(hexToRgb(DARK.current)),
    );
  });
});

describe("shape and motion tokens", () => {
  it("publishes the radius ladder from DESIGN.md 5.2", () => {
    for (const [token, value] of [
      ["--akinti-radius-label", "2px"],
      ["--akinti-radius-tag", "6px"],
      ["--akinti-radius-field", "10px"],
      ["--akinti-radius-key", "14px"],
      ["--akinti-radius-object", "16px"],
      ["--akinti-radius-sheet", "24px"],
    ] as const) {
      expect(GLOBALS).toContain(`${token}: ${value}`);
    }
  });

  it("keeps one corner curvature for record keys, not one radius", () => {
    // 0.295 x side: 72 -> 21, 88 -> 26, 96 -> 28.
    expect(GLOBALS).toContain("--akinti-radius-key-72: 21px");
    expect(GLOBALS).toContain("--akinti-radius-key-88: 26px");
    expect(GLOBALS).toContain("--akinti-radius-key-96: 28px");
  });

  it("publishes the motion tokens from DESIGN.md 7.1", () => {
    for (const token of [
      "--dur-micro: 90ms",
      "--dur-quick: 140ms",
      "--dur-normal: 200ms",
      "--dur-morph: 180ms",
      "--dur-macro: 380ms",
      "--ease-enter: cubic-bezier(0.2, 0, 0, 1)",
      "--ease-exit: cubic-bezier(0.4, 0, 1, 1)",
      "--ease-press: cubic-bezier(0.3, 0, 0.2, 1)",
      "--ease-time: linear",
    ]) {
      expect(GLOBALS).toContain(token);
    }
  });

  it("keeps the rail at 44px and the page padding at 20px (5.1, 5.4)", () => {
    expect(GLOBALS).toContain("--akinti-rail: 44px");
    expect(GLOBALS).toContain("--akinti-page-inline: 20px");
  });

  it("ships exactly one infinite animation, the record lamp (12.34)", () => {
    const infinite = GLOBALS.match(/infinite/g) ?? [];
    expect(infinite).toHaveLength(1);
    expect(GLOBALS).toContain("animation: akinti-lamp 1400ms ease-in-out infinite");
  });

  it("never uses 100vh (12.43)", () => {
    expect(GLOBALS).not.toContain("100vh");
  });

  it("has no backdrop-filter anywhere (12.15)", () => {
    expect(GLOBALS).not.toContain("backdrop-filter");
  });
});
