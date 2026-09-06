// Vitest stand-in for `next-intl`'s client hooks (aliased in `vitest.config.ts`,
// alongside the existing `server-only` mock this file's sibling follows).
//
// `useTranslations`/`useFormatter` normally read from `NextIntlClientProvider`'s
// React context, which no component test wraps its tree in — every existing
// test renders a bare component tree. Rather than adding that provider (and
// its message bundle) to every test that touches a translated component,
// this resolves messages directly from `src/messages/en.json` (the typed
// source locale, `src/i18n/global.ts`), so a test asserting on real English
// copy keeps working unmodified after a component adopts `useTranslations`.
//
// Deliberately minimal: `{placeholder}` interpolation and a small `t.rich`
// (single-level tags only) are all any current component/test needs.
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";

type Messages = typeof en;

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

function resolveNamespace(namespace?: string, locale?: MockLocale): Record<string, unknown> {
  const messages = MESSAGES_BY_LOCALE[locale ?? mockLocale];
  if (!namespace) return messages as unknown as Record<string, unknown>;
  const parts = namespace.split(".");
  let node: unknown = messages;
  for (const part of parts) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  return (node as Record<string, unknown>) ?? {};
}

function resolveMessage(namespace: string | undefined, key: string, locale?: MockLocale): string {
  const scope = resolveNamespace(namespace, locale);
  const parts = key.split(".");
  let value: unknown = scope;
  for (const part of parts) {
    value = (value as Record<string, unknown> | undefined)?.[part];
  }
  return typeof value === "string" ? value : key;
}

function interpolate(message: string, values?: Record<string, unknown>): string {
  if (!values) return message;
  return Object.entries(values).reduce(
    (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)),
    message,
  );
}

export interface MockTranslator {
  (key: string, values?: Record<string, unknown>): string;
  rich: (key: string, values?: Record<string, (chunks: string) => unknown>) => unknown;
}

function makeTranslator(namespace?: string, locale?: MockLocale): MockTranslator {
  const t = ((key: string, values?: Record<string, unknown>) =>
    interpolate(resolveMessage(namespace, key, locale), values)) as MockTranslator;
  t.rich = (key: string, values) => {
    const raw = resolveMessage(namespace, key, locale);
    const match = /^([\s\S]*)<(\w+)>([\s\S]*)<\/\2>([\s\S]*)$/.exec(raw);
    if (!match || !values) return raw;
    const [, before, tag, inner, after] = match;
    const render = values[tag];
    return [before, render ? render(inner ?? "") : inner, after];
  };
  return t;
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
