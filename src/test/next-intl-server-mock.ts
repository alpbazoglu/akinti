// Vitest stand-in for `next-intl/server` (aliased in `vitest.config.ts`). See
// `next-intl-mock.ts`'s header comment for why this resolves directly from
// `src/messages/en.json` rather than requiring a request context in tests.
import { resolveTranslator, type MockTranslator } from "./next-intl-mock";

export async function getTranslations(namespace?: string): Promise<MockTranslator> {
  return resolveTranslator(namespace);
}

export async function getFormatter() {
  return {
    number: (value: number) => new Intl.NumberFormat("en-US").format(value),
    dateTime: (value: Date | number | string) => new Intl.DateTimeFormat("en-US").format(new Date(value)),
  };
}

export async function getLocale(): Promise<string> {
  return "en";
}
