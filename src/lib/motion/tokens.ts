/**
 * Motion tokens (`docs/design/DESIGN.md` §7.1).
 *
 * These are the same five durations and four easings that `globals.css`
 * publishes as CSS custom properties; this module exists so JavaScript-driven
 * motion (Motion/Framer transitions, the sheet spring, the record-key
 * inversion) reads the same numbers rather than restating them.
 *
 * The rule that matters most: anything bound to audio time — playhead,
 * progress, scrub, the live trace, the timer — is `linear` at zero duration.
 * A playhead that eases is lying about time (§6.3, §12.7).
 */

export const DURATION = {
  /** Press, key inversion, toggle. */
  micro: 90,
  /** Exit, dismissal. */
  quick: 140,
  /** Enter, tab change, badge swap. */
  normal: 200,
  /** The A/B trace redraw on the Enhance step. */
  morph: 180,
  /** Bottom sheet, route transition. */
  macro: 380,
} as const;

export type DurationToken = keyof typeof DURATION;

export const EASE = {
  enter: [0.2, 0, 0, 1],
  exit: [0.4, 0, 1, 1],
  press: [0.3, 0, 0.2, 1],
} as const;

export type EaseToken = keyof typeof EASE;

/** CSS `cubic-bezier(...)` strings, for inline styles and Canvas-free CSS. */
export const EASE_CSS = {
  enter: "cubic-bezier(0.2, 0, 0, 1)",
  exit: "cubic-bezier(0.4, 0, 1, 1)",
  press: "cubic-bezier(0.3, 0, 0.2, 1)",
  /** Anything bound to the transport. */
  time: "linear",
} as const;

/** Seconds, the unit Motion expects. */
export function seconds(token: DurationToken): number {
  return DURATION[token] / 1000;
}

/** The sheet spring (§7.1). Used by the bottom sheet and nothing else. */
export const SHEET_SPRING = {
  type: "spring",
  stiffness: 380,
  damping: 34,
  mass: 0.9,
} as const;

/**
 * Enter: opacity 0 to 1 with `translateY(6px)` over 200ms. Six pixels, not
 * twenty-four, and lists never stagger (§7.2, §12.33).
 */
export const ENTER = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: seconds("normal"), ease: EASE.enter },
} as const;

/** Exit: opacity only. Nothing slides away, scales down or blurs out (§7.2). */
export const EXIT = {
  exit: { opacity: 0 },
  transition: { duration: seconds("quick"), ease: EASE.exit },
} as const;

/** Press: scale only, no translate (§7.2). */
export const PRESS = {
  whileTap: { scale: 0.975 },
  transition: { duration: seconds("micro"), ease: EASE.press },
} as const;

/**
 * The record lamp, the single infinite animation in the product (§7.2,
 * §12.34). Under reduced motion it becomes a static filled Signal dot rather
 * than disappearing (§7.3) — `globals.css` enforces that half.
 */
export const LAMP = {
  durationMs: 1400,
  minOpacity: 0.55,
  maxOpacity: 1,
} as const;

/** True when the reader asked for less movement. Safe during SSR. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
