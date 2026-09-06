/**
 * WCAG 2 contrast math: relative luminance / contrast ratio, straight from
 * the spec (https://www.w3.org/TR/WCAG21/#contrast-minimum). Pure and
 * synchronous so it is trivially unit-testable (`profileTheme.test.ts`) and
 * reusable wherever a colour choice needs a contrast check — this is the
 * "standalone Node script" `docs/design/COLOR_V2.md`'s "Final values"
 * section describes verifying every token against, and the permanent
 * regression guard is `src/lib/ui/designTokens.test.ts`.
 *
 * This file used to also hold the profile appearance preset system
 * (background/gradient/pattern/accent swatches) — removed per QA `full2`
 * defect #1: it violated COLOR_V2 (violet/plum presets, gradients) and had
 * no visible effect anywhere. Appearance is now just a signature hue
 * (`SIGNATURE_HUES`, `src/types/domain.ts`), resolved directly from CSS
 * custom properties (`--akinti-hue-*`, `src/app/globals.css`) — no preset
 * table or contrast resolution needed for it.
 */

const WCAG_AA_NORMAL_TEXT = 4.5;

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/** Parse a `#rrggbb` (or `#rgb`) hex color. Throws on malformed input — every caller here uses a fixed literal. */
export function hexToRgb(hex: string): RgbColor {
  const normalized = hex.trim().replace(/^#/, "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

function linearizeChannel(channel8bit: number): number {
  const c = channel8bit / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(color: RgbColor): number {
  const r = linearizeChannel(color.r);
  const g = linearizeChannel(color.g);
  const b = linearizeChannel(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors, from 1 (no contrast) to 21 (black on white). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexToRgb(hexA));
  const lumB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** True when text `fgHex` on background `bgHex` clears WCAG AA for normal-size text. */
export function meetsAA(bgHex: string, fgHex: string): boolean {
  return contrastRatio(bgHex, fgHex) >= WCAG_AA_NORMAL_TEXT;
}
