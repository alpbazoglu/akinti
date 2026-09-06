/**
 * Server-side translation for Zod validation messages (`docs/I18N.md`).
 *
 * Every custom message in `src/lib/validation/**` is written as a message key
 * under the `validation` namespace in `src/messages/{tr,en}.json` — e.g.
 * `.min(3, "validation.usernameMin")` rather than a hardcoded English
 * sentence — because a Zod schema is a plain module-level constant evaluated
 * once at import time, before any per-request locale exists (the same
 * reasoning `src/config/terminology.ts`'s header comment gives for why
 * `TERMS` stays English-only). One message
 * (`validation.duetTooManyTurns`, `src/lib/validation/duets.ts`) needs an
 * interpolated value; it is written as `"validation.duetTooManyTurns:12"` —
 * everything after the first `:` becomes the `{value}` placeholder passed to
 * the translator.
 *
 * These helpers turn a raw Zod issue message (either shape) into real copy
 * for the caller's request locale, at the Server Action boundary — never
 * inside the schema itself, which has no locale to translate with. A message
 * that does not look like one of ours (Zod's own built-in messages, e.g.
 * "Invalid input", or an arbitrary caught error's `.message` used as a
 * `superRefine` fallback) is returned unchanged rather than risking a lookup
 * this module never wrote — `t()` throws on an unknown key.
 */

/**
 * A loose stand-in for next-intl's real `Translator` type. The real type
 * (`Awaited<ReturnType<typeof getTranslations>>`) keys its call signature to
 * a huge literal union spanning every namespace in `src/messages/en.json`
 * (`NamespacedMessageKeys<Messages, never>` for a root-scoped translator) —
 * fine for a call site translating its own literal keys, but these functions
 * are generic (`describeError`/`mapModerationError` in several action
 * modules, plus this file) and call `t` with a key computed at runtime, so
 * they can never use that literal-union type; TypeScript also hits real
 * complexity limits ("union type too complex to represent") trying to
 * instantiate the full-app union as a plain function parameter type at every
 * call site. Callers pass their real translator here with `as
 * MessageTranslator` — safe in practice, since every key actually reachable
 * is a real one, verified by this module's tests and `scripts/i18n-check.ts`
 * rather than by the type system.
 */
export type MessageTranslator = (key: string, values?: Record<string, unknown>) => string;

const VALIDATION_KEY_PATTERN = /^[a-zA-Z]+(\.[a-zA-Z0-9]+)+$/;

/** Translate one Zod issue message. Non-key messages (Zod defaults, caught-error fallbacks) pass through unchanged. */
export function translateValidationMessage(t: MessageTranslator, message: string): string {
  const separator = message.indexOf(":");
  const key = separator === -1 ? message : message.slice(0, separator);
  if (!VALIDATION_KEY_PATTERN.test(key)) return message;

  const param = separator === -1 ? undefined : message.slice(separator + 1);
  try {
    return param === undefined ? t(key) : t(key, { value: param });
  } catch {
    return message;
  }
}

/**
 * Translate every message in a Zod `safeParse` failure's
 * `.error.flatten().fieldErrors` shape — pass the result to
 * `fieldErrorsFromZod` (`src/lib/auth/types.ts`) exactly as before, this only
 * swaps each raw key for real copy first.
 */
export function translateFieldErrors<T extends Record<string, string[] | undefined>>(
  t: MessageTranslator,
  fieldErrors: T,
): T {
  const translated = {} as T;
  for (const [field, messages] of Object.entries(fieldErrors)) {
    translated[field as keyof T] = (
      messages ? messages.map((message) => translateValidationMessage(t, message)) : messages
    ) as T[keyof T];
  }
  return translated;
}
