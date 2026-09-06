/**
 * Push-notification copy resolution (`docs/I18N.md`). A push is sent to the
 * *recipient*, who is never the caller whose request triggered it (see
 * `send.ts`'s header comment) — there is no ambient request to read a locale
 * from the way `getTranslations()` does for a Server Action's own response.
 * This resolves a message key against `src/messages/{tr,en}.json` directly,
 * for an explicitly-passed locale (the recipient's `profiles.locale`,
 * resolved by the caller), independent of next-intl's request-scoped APIs.
 *
 * Deliberately hand-rolled rather than next-intl's `createTranslator`: the
 * only interpolation a push title/body ever needs is a plain `{name}`
 * placeholder (see `DuetsActions.duetRequestAcceptedBody`,
 * `DuetRecordActions.newDuetRequestBody`), never ICU plurals/dates, so a
 * small resolver here avoids depending on next-intl outside of a request/
 * component context at all.
 */
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";
import type { AppLocale } from "@/i18n/locale";

const MESSAGES: Record<AppLocale, Record<string, unknown>> = { en, tr };

function lookup(locale: AppLocale, key: string): string | undefined {
  const parts = key.split(".");
  let node: unknown = MESSAGES[locale];
  for (const part of parts) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(message: string, params?: Record<string, string>): string {
  if (!params) return message;
  return Object.entries(params).reduce((acc, [name, value]) => acc.replaceAll(`{${name}}`, value), message);
}

/**
 * Resolve a `"Namespace.key"` message for `locale`. Falls back to English if
 * the Turkish message is somehow missing — key parity between
 * `messages/{tr,en}.json` is otherwise enforced by `scripts/i18n-check.ts`
 * and this module's own test, so this should never actually trigger — and,
 * as a last resort, to the raw key itself, so a push notification is never
 * silently empty even if a key is ever mistyped.
 *
 * `termParams`, not `params`: every placeholder a push title/body currently
 * interpolates is a product term (`Duet`, `Wave`, `Duet Request` —
 * `TERMS`/`Terms` in `src/config/terminology.ts`), and `TERMS.x` is
 * deliberately English-only (see that file's header comment) — handing a
 * `TERMS.x` value straight to `interpolate` would embed English inside an
 * otherwise-Turkish sentence. Each `termParams` value is instead a `Terms.*`
 * key (e.g. `{ duet: "duet" }`), resolved against the *same* `locale` as the
 * surrounding message before interpolation.
 */
export function resolvePushMessage(
  locale: AppLocale,
  key: string,
  termParams?: Record<string, string>,
): string {
  const message = lookup(locale, key) ?? lookup("en", key) ?? key;
  if (!termParams) return message;

  const resolved: Record<string, string> = {};
  for (const [placeholder, termKey] of Object.entries(termParams)) {
    const path = `Terms.${termKey}`;
    resolved[placeholder] = lookup(locale, path) ?? lookup("en", path) ?? termKey;
  }
  return interpolate(message, resolved);
}
