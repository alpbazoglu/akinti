import type en from "@/messages/en.json";

import type { formats } from "./formats";

/**
 * Registers `messages/en.json`'s shape (English is `sourceLocale` — see
 * `docs/I18N.md`) as the canonical message type. `useTranslations`/
 * `getTranslations` calls are then checked against real namespaces and
 * keys; a typo like `t("Setttings.title")` is a build-time TypeScript
 * error, not a silently-blank string at runtime. `tr.json` is NOT typed
 * against — it must have the exact same keys as `en.json` by convention,
 * checked by `scripts/i18n-check.ts` rather than the type system.
 */
declare module "next-intl" {
  interface AppConfig {
    Messages: typeof en;
    Formats: typeof formats;
  }
}
