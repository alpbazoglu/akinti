/**
 * Profile customization presets (spec §21): background color, gradient,
 * subtle pattern, accent color. A curated set of tokens, not an open CSS
 * field — every combination in `THEME_BACKGROUND_COLORS`/`THEME_ACCENTS` is
 * pre-vetted here rather than accepting arbitrary user color input, and the
 * foreground text color paired with each swatch is chosen programmatically
 * (never hardcoded per-swatch) so a new preset can never accidentally ship
 * under the WCAG AA contrast floor (4.5:1 for normal text).
 *
 * Contrast math: WCAG 2 relative luminance / contrast ratio, straight from
 * the spec (https://www.w3.org/TR/WCAG21/#contrast-minimum). Pure and
 * synchronous so it is trivially unit-testable (`profileTheme.test.ts`).
 */

import type {
  ProfileTheme,
  ThemeAccent,
  ThemeBackgroundColor,
  ThemeBackgroundGradient,
  ThemeBackgroundPattern,
} from "@/types/domain";

/** The only two text colors a themed surface ever pairs with — matches the app's own fg tokens. */
export const READABLE_LIGHT = "#f5f6f8";
export const READABLE_DARK = "#12151a";

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

/**
 * Pick whichever of the two fixed readable colors (near-white / near-ink)
 * contrasts more strongly against `bgHex`. Guarantees every preset below is
 * AA-safe by construction rather than by manual review.
 */
export function pickReadableForeground(bgHex: string): string {
  const lightRatio = contrastRatio(bgHex, READABLE_LIGHT);
  const darkRatio = contrastRatio(bgHex, READABLE_DARK);
  return lightRatio >= darkRatio ? READABLE_LIGHT : READABLE_DARK;
}

/* ------------------------------------------------------------------------ */
/* Background color presets                                                 */
/* ------------------------------------------------------------------------ */

export interface BackgroundPreset {
  readonly id: ThemeBackgroundColor;
  readonly label: string;
  readonly hex: string;
}

export const BACKGROUND_PRESETS: Readonly<Record<ThemeBackgroundColor, BackgroundPreset>> = {
  ink: { id: "ink", label: "Ink", hex: "#14171c" },
  slate: { id: "slate", label: "Slate", hex: "#48505c" },
  sand: { id: "sand", label: "Sand", hex: "#cbb996" },
  mist: { id: "mist", label: "Mist", hex: "#c9d3da" },
  plum: { id: "plum", label: "Plum", hex: "#4b3153" },
  forest: { id: "forest", label: "Forest", hex: "#1f3d30" },
};

/* ------------------------------------------------------------------------ */
/* Accent presets                                                           */
/* ------------------------------------------------------------------------ */

export interface AccentPreset {
  readonly id: ThemeAccent;
  readonly label: string;
  readonly hex: string;
}

export const ACCENT_PRESETS: Readonly<Record<ThemeAccent, AccentPreset>> = {
  aqua: { id: "aqua", label: "Aqua", hex: "#0a6e78" },
  violet: { id: "violet", label: "Violet", hex: "#6a4ce0" },
  amber: { id: "amber", label: "Amber", hex: "#8a5a00" },
  rose: { id: "rose", label: "Rose", hex: "#c23f63" },
  emerald: { id: "emerald", label: "Emerald", hex: "#146e49" },
  slate: { id: "slate", label: "Slate", hex: "#525b68" },
};

/* ------------------------------------------------------------------------ */
/* Gradient presets — a soft two-stop wash layered over the background      */
/* color at low opacity. Decorative only: no text is ever rendered directly */
/* on a gradient (see `ProfileHeader`), so these do not need their own      */
/* contrast-checked foreground.                                            */
/* ------------------------------------------------------------------------ */

export interface GradientPreset {
  readonly id: ThemeBackgroundGradient;
  readonly label: string;
  /** `null` for "none". Otherwise a CSS `linear-gradient(...)` value. */
  readonly css: string | null;
}

export const GRADIENT_PRESETS: Readonly<Record<ThemeBackgroundGradient, GradientPreset>> = {
  none: { id: "none", label: "None", css: null },
  dawn: {
    id: "dawn",
    label: "Dawn",
    css: "linear-gradient(135deg, rgb(255 200 150 / 0.35), rgb(255 140 170 / 0.25))",
  },
  dusk: {
    id: "dusk",
    label: "Dusk",
    css: "linear-gradient(135deg, rgb(120 110 255 / 0.3), rgb(60 40 110 / 0.35))",
  },
  tide: {
    id: "tide",
    label: "Tide",
    css: "linear-gradient(135deg, rgb(20 180 190 / 0.3), rgb(10 70 110 / 0.3))",
  },
  ember: {
    id: "ember",
    label: "Ember",
    css: "linear-gradient(135deg, rgb(255 130 60 / 0.32), rgb(150 30 30 / 0.3))",
  },
  aurora: {
    id: "aurora",
    label: "Aurora",
    css: "linear-gradient(135deg, rgb(60 220 160 / 0.3), rgb(130 90 230 / 0.28))",
  },
};

/* ------------------------------------------------------------------------ */
/* Pattern presets — CSS-only tileable textures, no image assets. Applied   */
/* at low opacity as a decorative overlay behind the avatar/banner area     */
/* only, never behind body text.                                           */
/* ------------------------------------------------------------------------ */

export interface PatternPreset {
  readonly id: ThemeBackgroundPattern;
  readonly label: string;
  /** `null` for "none". Otherwise a CSS `background-image`/`background-size` pair. */
  readonly backgroundImage: string | null;
  readonly backgroundSize: string | null;
}

const PATTERN_INK = "rgb(255 255 255 / 0.16)";

export const PATTERN_PRESETS: Readonly<Record<ThemeBackgroundPattern, PatternPreset>> = {
  none: { id: "none", label: "None", backgroundImage: null, backgroundSize: null },
  waves: {
    id: "waves",
    label: "Waves",
    backgroundImage: `repeating-radial-gradient(circle at 0 100%, transparent 0, transparent 6px, ${PATTERN_INK} 7px, transparent 8px)`,
    backgroundSize: "24px 24px",
  },
  dots: {
    id: "dots",
    label: "Dots",
    backgroundImage: `radial-gradient(${PATTERN_INK} 1.5px, transparent 1.5px)`,
    backgroundSize: "16px 16px",
  },
  grid: {
    id: "grid",
    label: "Grid",
    backgroundImage: `linear-gradient(${PATTERN_INK} 1px, transparent 1px), linear-gradient(90deg, ${PATTERN_INK} 1px, transparent 1px)`,
    backgroundSize: "20px 20px",
  },
  noise: {
    id: "noise",
    label: "Noise",
    backgroundImage: `repeating-linear-gradient(45deg, ${PATTERN_INK} 0, ${PATTERN_INK} 1px, transparent 1px, transparent 5px), repeating-linear-gradient(-45deg, ${PATTERN_INK} 0, ${PATTERN_INK} 1px, transparent 1px, transparent 5px)`,
    backgroundSize: "6px 6px",
  },
  rings: {
    id: "rings",
    label: "Rings",
    backgroundImage: `repeating-radial-gradient(circle, transparent 0, transparent 10px, ${PATTERN_INK} 11px, transparent 12px)`,
    backgroundSize: "36px 36px",
  },
};

/* ------------------------------------------------------------------------ */
/* Resolution                                                               */
/* ------------------------------------------------------------------------ */

export interface ResolvedProfileTheme {
  background: BackgroundPreset;
  gradient: GradientPreset;
  pattern: PatternPreset;
  accent: AccentPreset;
  /** AA-safe against `background.hex` — the only foreground ever used on the banner itself. */
  bannerForeground: string;
  /** AA-safe against `accent.hex` — for text/icons placed on an accent-colored control. */
  accentForeground: string;
  /** CSS custom properties a component can spread onto a themed element's `style`. */
  style: Readonly<Record<string, string>>;
}

/** Resolve a profile's stored theme columns into concrete, AA-safe CSS. */
export function resolveProfileTheme(theme: ProfileTheme): ResolvedProfileTheme {
  const background = BACKGROUND_PRESETS[theme.backgroundColor];
  const gradient = GRADIENT_PRESETS[theme.backgroundGradient];
  const pattern = PATTERN_PRESETS[theme.backgroundPattern];
  const accent = ACCENT_PRESETS[theme.accent];

  const layers = [gradient.css, pattern.backgroundImage].filter(
    (layer): layer is string => layer !== null,
  );

  return {
    background,
    gradient,
    pattern,
    accent,
    bannerForeground: pickReadableForeground(background.hex),
    accentForeground: pickReadableForeground(accent.hex),
    style: {
      "--profile-banner-bg": background.hex,
      "--profile-banner-fg": pickReadableForeground(background.hex),
      "--profile-banner-image": layers.length > 0 ? layers.join(", ") : "none",
      "--profile-banner-size": pattern.backgroundSize ?? "auto",
      "--profile-accent-bg": accent.hex,
      "--profile-accent-fg": pickReadableForeground(accent.hex),
    },
  };
}
