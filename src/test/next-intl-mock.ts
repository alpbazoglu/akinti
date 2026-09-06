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

type Messages = typeof en;

function resolveNamespace(namespace?: string): Record<string, unknown> {
  if (!namespace) return en as unknown as Record<string, unknown>;
  const parts = namespace.split(".");
  let node: unknown = en;
  for (const part of parts) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  return (node as Record<string, unknown>) ?? {};
}

function resolveMessage(namespace: string | undefined, key: string): string {
  const scope = resolveNamespace(namespace);
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

function makeTranslator(namespace?: string): MockTranslator {
  const t = ((key: string, values?: Record<string, unknown>) =>
    interpolate(resolveMessage(namespace, key), values)) as MockTranslator;
  t.rich = (key: string, values) => {
    const raw = resolveMessage(namespace, key);
    const match = /^([\s\S]*)<(\w+)>([\s\S]*)<\/\2>([\s\S]*)$/.exec(raw);
    if (!match || !values) return raw;
    const [, before, tag, inner, after] = match;
    const render = values[tag];
    return [before, render ? render(inner ?? "") : inner, after];
  };
  return t;
}

/** Non-hook-named alias so `next-intl/server`'s mock can call this without eslint's react-hooks rule flagging it as a hook called from a plain async function. */
export function resolveTranslator(namespace?: string): MockTranslator {
  return makeTranslator(namespace);
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
  return "en";
}

export type { Messages };
