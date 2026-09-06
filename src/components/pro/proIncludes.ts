/**
 * PRODUCT_V2 §4/§5's Pro-only list, shared by the paywall sheet (`ProGate`)
 * and the not-subscribed Pro screen — one list, never repeated by hand.
 * Plain, no icons-in-circles, no cards.
 *
 * A plain module-level constant can't carry translated strings (evaluated
 * once at import time, before any per-request locale exists, `docs/I18N.md`
 * §4) — this only carries the lookup keys under the `Pro.includes` message
 * namespace; callers resolve them with `useTranslations("Pro")` and
 * `t(`includes.${key}`)`.
 */
export const PRO_INCLUDE_KEYS = [
  "pitchSnap",
  "stems",
  "unlimitedSaves",
  "adFree",
  "featuredDuet",
  "proMark",
] as const;
