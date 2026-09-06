import type { Formats } from "next-intl";

/**
 * Named `useFormatter` formats shared across both locales — Martian Mono
 * numerals still render every count/timecode (`docs/design/DESIGN.md` §3.4);
 * this only controls how `Intl` turns a JS number/Date into the digits that
 * get set in that font, not the typography itself.
 */
export const formats = {
  number: {
    // AKINTI Pro pricing (`docs/PRODUCT_V2.md`): TRY for Turkish accounts,
    // USD otherwise. Currency is a formatting parameter, not a locale one —
    // callers pass `{style: "currency", currency: "TRY" | "USD"}` explicitly
    // rather than relying on the active locale to imply a currency.
    try: { style: "currency", currency: "TRY" },
    usd: { style: "currency", currency: "USD" },
    compact: { notation: "compact", maximumFractionDigits: 1 },
  },
  dateTime: {
    short: { day: "numeric", month: "short" },
    full: { day: "numeric", month: "long", year: "numeric" },
  },
} satisfies Formats;
