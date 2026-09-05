import { describe, expect, it } from "vitest";

import { DURATION, EASE, EASE_CSS, ENTER, EXIT, LAMP, PRESS, SHEET_SPRING, seconds } from "./tokens";

describe("motion tokens", () => {
  it("matches the five durations in DESIGN.md 7.1", () => {
    expect(DURATION).toEqual({
      micro: 90,
      quick: 140,
      normal: 200,
      morph: 180,
      macro: 380,
    });
  });

  it("converts to the seconds Motion expects", () => {
    expect(seconds("micro")).toBeCloseTo(0.09);
    expect(seconds("macro")).toBeCloseTo(0.38);
  });

  it("keeps anything bound to the transport linear", () => {
    // A playhead that eases is lying about time (DESIGN.md 6.3, 12.7).
    expect(EASE_CSS.time).toBe("linear");
  });

  it("publishes the same curves as CSS and as control points", () => {
    expect(EASE_CSS.enter).toBe(`cubic-bezier(${EASE.enter.join(", ")})`);
    expect(EASE_CSS.exit).toBe(`cubic-bezier(${EASE.exit.join(", ")})`);
    expect(EASE_CSS.press).toBe(`cubic-bezier(${EASE.press.join(", ")})`);
  });

  it("enters six pixels, not twenty-four", () => {
    expect(ENTER.initial).toEqual({ opacity: 0, y: 6 });
    expect(ENTER.animate).toEqual({ opacity: 1, y: 0 });
  });

  it("exits on opacity alone", () => {
    expect(EXIT.exit).toEqual({ opacity: 0 });
  });

  it("presses by scale only, with no translate", () => {
    expect(PRESS.whileTap).toEqual({ scale: 0.975 });
  });

  it("uses the sheet spring from the spec", () => {
    expect(SHEET_SPRING).toMatchObject({ stiffness: 380, damping: 34, mass: 0.9 });
  });

  it("breathes the record lamp between 100% and 55% over 1400ms", () => {
    expect(LAMP).toEqual({ durationMs: 1400, minOpacity: 0.55, maxOpacity: 1 });
  });
});
