// Vitest stand-in for `next-intl/server` (aliased in `vitest.config.ts`). See
// `next-intl-mock.ts`'s header comment for why this resolves directly from
// `src/messages/en.json` rather than requiring a request context in tests.
import {
  __getMockLocale,
  __setMockLocale,
  resolveTranslator,
  type GetTranslationsOptions,
  type MockTranslator,
} from "./next-intl-mock";

export async function getTranslations(arg?: string | GetTranslationsOptions): Promise<MockTranslator> {
  return resolveTranslator(arg);
}

export async function getFormatter() {
  return {
    number: (value: number) => new Intl.NumberFormat("en-US").format(value),
    dateTime: (value: Date | number | string) => new Intl.DateTimeFormat("en-US").format(new Date(value)),
  };
}

export async function getLocale(): Promise<string> {
  return __getMockLocale();
}

// Re-exported so a Server Action test can do
// `import { __setMockLocale } from "@/test/next-intl-mock"` (or via this
// server alias, same module under the hood) to assert Turkish copy under a
// "tr request" without needing a real request context.
export { __getMockLocale, __setMockLocale };
