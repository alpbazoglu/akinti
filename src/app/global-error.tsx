"use client";

import { BRAND } from "@/config/terminology";
import { Button, ErrorState } from "@/components/ui";
import { DEFAULT_LOCALE, isAppLocale, LOCALE_COOKIE, type AppLocale } from "@/i18n/locale";

import "./globals.css";

/**
 * Catches an error thrown by the root layout itself (`src/app/layout.tsx`)
 * — the one place `error.tsx` cannot reach, since `error.tsx` wraps
 * everything *below* the layout, not the layout itself. Must define its own
 * `<html>`/`<body>` and import its own styles; it replaces the document
 * entirely while active (Next's `global-error.js` convention), so nothing
 * here can depend on `Providers`/`AuthProvider` — the thing that just threw
 * may be exactly that tree. Navigation uses a plain full-page reload rather
 * than the App Router client, for the same reason: don't lean on the part of
 * the app that may be in a broken state.
 *
 * Copy is a tiny hand-rolled bilingual lookup, not `next-intl`'s
 * `useTranslations` — that needs `NextIntlClientProvider`, which is exactly
 * the kind of context this file cannot depend on. `@/i18n/locale` is safe to
 * import: pure constants/functions, no React context. Reads only the
 * `akinti_locale` cookie directly (no `Accept-Language`/profile access
 * client-side) and falls back to English.
 */
const COPY: Record<AppLocale, { hitAProblem: string; withRef: string; withoutRef: string; reload: string }> = {
  en: {
    hitAProblem: "hit a problem",
    withRef: "Something went wrong loading the app (ref {ref}). Reloading usually fixes this.",
    withoutRef: "Something went wrong loading the app. Reloading usually fixes this.",
    reload: "Reload",
  },
  tr: {
    hitAProblem: "bir sorunla karşılaştı",
    withRef: "Uygulama yüklenirken bir şeyler ters gitti (referans {ref}). Yeniden yüklemek genelde bunu çözer.",
    withoutRef: "Uygulama yüklenirken bir şeyler ters gitti. Yeniden yüklemek genelde bunu çözer.",
    reload: "Yeniden yükle",
  },
};

function detectLocale(): AppLocale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  return isAppLocale(value) ? value : DEFAULT_LOCALE;
}

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const locale = detectLocale();
  const copy = COPY[locale];

  return (
    <html lang={locale}>
      <body className="min-h-full bg-surface">
        <main className="flex min-h-dvh items-center justify-center px-4">
          <ErrorState
            title={`${BRAND} ${copy.hitAProblem}`}
            description={
              error.digest ? copy.withRef.replace("{ref}", error.digest) : copy.withoutRef
            }
            action={
              <Button onClick={() => window.location.reload()}>
                {copy.reload} {BRAND}
              </Button>
            }
          />
        </main>
      </body>
    </html>
  );
}
