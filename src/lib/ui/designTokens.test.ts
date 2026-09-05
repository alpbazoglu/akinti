import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio } from "./profileTheme";

/**
 * A regression guard on the palette itself.
 *
 * `docs/design/DESIGN.md` §12 lists the colours and shapes that would return
 * the product to looking generated, and §12.44 forbids adding a token without
 * deleting one. Those are review rules, and review rules rot; these are the
 * ones a machine can hold.
 *
 * Comments are stripped first: a comment naming a banned value is
 * documentation, not a declaration.
 */
const GLOBALS = readFileSync(
  path.join(process.cwd(), "src", "app", "globals.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

const LIGHT = {
  paper: "#efefec",
  ink: "#191a17",
  inkMuted: "#52534c",
  inkSubtle: "#6a6b63",
  signal: "#de3c11",
  signalDeep: "#a32a08",
  waveDormant: "#86877e",
} as const;

const DARK = {
  paper: "#131412",
  ink: "#edede8",
  inkMuted: "#a0a199",
  inkSubtle: "#7e7f77",
  signal: "#ff5c33",
  signalDeep: "#ff9376",
  waveDormant: "#63645d",
} as const;

describe("palette tokens", () => {
  it("defines every Gündüz value from DESIGN.md 4.2", () => {
    for (const hex of Object.values(LIGHT)) {
      expect(GLOBALS).toContain(hex);
    }
  });

  it("defines every Gece value from DESIGN.md 4.3", () => {
    for (const hex of Object.values(DARK)) {
      expect(GLOBALS).toContain(hex);
    }
  });

  it("has no teal left anywhere", () => {
    // The v1 accent and its whole ramp (DESIGN.md 4.1).
    for (const teal of ["#0e7c86", "#0b6a73", "#095960", "#34c3ce", "#e4f2f3", "#7cdde5"]) {
      expect(GLOBALS).not.toContain(teal);
    }
  });

  it("has no indigo, violet or purple, in any shade (12.11)", () => {
    expect(GLOBALS.toLowerCase()).not.toMatch(/#(6|7|8)[0-9a-f]{1}[0-9a-f]{2}(f|e)[0-9a-f]/);
    expect(GLOBALS.toLowerCase()).not.toContain("indigo");
    expect(GLOBALS.toLowerCase()).not.toContain("violet");
    expect(GLOBALS.toLowerCase()).not.toContain("purple");
  });

  it("does not use the generated dark ground (12.13)", () => {
    expect(GLOBALS.toLowerCase()).not.toContain("#0a0a0a");
    expect(GLOBALS).not.toMatch(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.1\s*\)/);
  });

  it("keeps green, amber and blue semantics out of the system (4.4)", () => {
    for (const banned of ["#0a7b4b", "#4cc38a", "#9a5b06", "#e0a458", "#b42318"]) {
      expect(GLOBALS).not.toContain(banned);
    }
  });
});

describe("palette contrast", () => {
  it("meets the AA floors DESIGN.md 4.2 states for light", () => {
    expect(contrastRatio(LIGHT.ink, LIGHT.paper)).toBeGreaterThanOrEqual(15);
    expect(contrastRatio(LIGHT.inkMuted, LIGHT.paper)).toBeGreaterThanOrEqual(6.5);
    expect(contrastRatio(LIGHT.inkSubtle, LIGHT.paper)).toBeGreaterThanOrEqual(4.5);
    // Error copy is the AA-safe Signal, never the graphic one.
    expect(contrastRatio(LIGHT.signalDeep, LIGHT.paper)).toBeGreaterThanOrEqual(4.5);
  });

  it("meets the AA floors DESIGN.md 4.3 states for dark", () => {
    expect(contrastRatio(DARK.ink, DARK.paper)).toBeGreaterThanOrEqual(15);
    expect(contrastRatio(DARK.inkMuted, DARK.paper)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(DARK.inkSubtle, DARK.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(DARK.signalDeep, DARK.paper)).toBeGreaterThanOrEqual(4.5);
  });

  it("clears the 3:1 non-text threshold for Signal and the dormant trace", () => {
    // Signal is a graphic-only token: it must be perceivable against the page
    // without ever being used for body text.
    expect(contrastRatio(LIGHT.signal, LIGHT.paper)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(DARK.signal, DARK.paper)).toBeGreaterThanOrEqual(3);
    // The unplayed trace has to read on its own, not only next to the played one.
    expect(contrastRatio(LIGHT.waveDormant, LIGHT.paper)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(DARK.waveDormant, DARK.paper)).toBeGreaterThanOrEqual(3);
  });

  it("keeps an ink glyph legible on a Signal field (4.4)", () => {
    // Keys with a Signal field carry an ink glyph and their label sits outside.
    expect(contrastRatio(LIGHT.ink, LIGHT.signal)).toBeGreaterThanOrEqual(3);
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
