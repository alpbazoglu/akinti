// Vitest stand-in for `next-intl`'s client hooks (aliased in `vitest.config.ts`,
// alongside the existing `server-only` mock this file's sibling follows).
//
// `useTranslations`/`useFormatter` normally read from `NextIntlClientProvider`'s
// React context, which no component test wraps its tree in — every existing
// test renders a bare component tree. Rather than adding that provider (and
// its message bundle) to every test that touches a translated component,
// this resolves messages directly from `src/messages/{en,tr}.json` (`en` is
// the typed source locale, `src/i18n/global.ts`).
//
// Translation itself goes through `use-intl`'s real `createTranslator` (the
// same engine `next-intl` re-exports it from) rather than a hand-rolled
// `{placeholder}` replaceAll (review3 finding 25): a naive replaceAll never
// understood ICU plural/select syntax, so a test asserting a metric line
// against a message using real ICU plurals passed against the raw ICU
// source string while production correctly rendered "3 plays" — the mock
// was hiding exactly the formatting layer next-intl was adopted for.
// Imported from `use-intl` directly, not `next-intl` (this module IS the
// `next-intl` alias target, so importing `next-intl` here would be
// circular) — `createTranslator` is synchronous and needs no
// `NextIntlClientProvider`.
import { createTranslator } from "use-intl";

import en from "@/messages/en.json";
import tr from "@/messages/tr.json";

type Messages = typeof en;

/**
 * `createTranslator`'s real signature ties its `namespace`/key arguments to
 * literal keys computed from the exact `messages` object type — the same
 * `NamespacedMessageKeys` machinery `docs/I18N.md` §8.1 already flags as
 * hitting TypeScript's complexity ceiling for a *namespaced* translator;
 * here `namespace`/`key` are plain runtime strings a test can pass for any
 * screen, so this mock deliberately calls through a loosened signature
 * instead of fighting that generic — one cast, at the one call site below.
 */
type LooseCreateTranslator = (config: {
  locale: string;
  messages: Record<string, unknown>;
  namespace?: string;
  onError?: (error: unknown) => void;
  getMessageFallback?: (info: { key: string }) => string;
}) => MockTranslator;

const MESSAGES_BY_LOCALE = { en, tr } as const;
type MockLocale = keyof typeof MESSAGES_BY_LOCALE;

/**
 * Mutable module-level locale, defaulting to English (every existing test
 * asserts English copy unmodified). A test that needs to assert Turkish
 * copy under a "tr request" (`docs/I18N.md` server-side i18n) calls
 * `__setMockLocale("tr")` before invoking the action/component under test,
 * and should restore it with `__setMockLocale("en")` (or `afterEach`)
 * afterward so locale doesn't leak between tests.
 */
let mockLocale: MockLocale = "en";

/** Test-only: set which locale's messages this mock resolves from. */
export function __setMockLocale(locale: MockLocale): void {
  mockLocale = locale;
}

/** Test-only: read the mock's current locale. */
export function __getMockLocale(): MockLocale {
  return mockLocale;
}

export interface MockTranslator {
  (key: string, values?: Record<string, unknown>): string;
  rich: (key: string, values?: Record<string, (chunks: string) => unknown>) => unknown;
}

/**
 * `messages`/`namespace`/`key` are loosely typed here on purpose
 * (`Record<string, unknown>`/plain `string`, not the precise `Messages`
 * type `en.json` carries): a test can request any namespace or key at
 * runtime, and typing this against the full message tree hits the same
 * "union type too complex to represent" ceiling `MessageTranslator`
 * (`src/lib/validation/translate.ts`, `docs/I18N.md` §8.1) documents for
 * the same reason.
 */
function makeTranslator(namespace?: string, locale?: MockLocale): MockTranslator {
  const resolvedLocale = locale ?? mockLocale;
  const messages = MESSAGES_BY_LOCALE[resolvedLocale] as unknown as Record<string, unknown>;
  const loosely = createTranslator as unknown as LooseCreateTranslator;
  return loosely({
    locale: resolvedLocale,
    messages,
    namespace,
    // A test resolving a namespace/key that doesn't exist yet is expected
    // sometimes (asserting a screen BEFORE its copy is migrated); stay
    // silent rather than spamming stderr the way next-intl's default
    // `onError` (`console.error`) would.
    onError: () => {},
    getMessageFallback: ({ key }) => key,
  });
}

export interface GetTranslationsOptions {
  locale?: MockLocale;
  namespace?: string;
}

/**
 * Non-hook-named alias so `next-intl/server`'s mock can call this without
 * eslint's react-hooks rule flagging it as a hook called from a plain async
 * function. Accepts either a bare namespace (uses the mock's current
 * `__setMockLocale` locale, mirroring `getTranslations()` reading the real
 * request's resolved locale) or `{ locale, namespace }` (an explicit
 * override — real next-intl's shape for resolving a *specific* locale
 * outside/instead of the ambient request locale, e.g.
 * `settings/actions.ts`'s `setLocale` confirming in the language just
 * chosen rather than the request's prior one).
 */
export function resolveTranslator(arg?: string | GetTranslationsOptions): MockTranslator {
  if (typeof arg === "object" && arg !== null) {
    return makeTranslator(arg.namespace, arg.locale);
  }
  return makeTranslator(arg);
}

export function useTranslations(namespace?: string): MockTranslator {
  return makeTranslator(namespace);
}

export function useFormatter() {
  return {
    number: (value: number) => new Intl.NumberFormat("en-US").format(value),
    dateTime: (value: Date | number | string) => new Intl.DateTimeFormat("en-US").format(new Date(value)),
    relativeTime: () => new Intl.RelativeTimeFormat("en-US").format(0, "second"),
  };
}

export function useLocale(): string {
  return mockLocale;
}

export type { Messages };
