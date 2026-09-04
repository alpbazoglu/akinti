"use client";

import { BRAND } from "@/config/terminology";
import { Button, ErrorState } from "@/components/ui";

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
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-full bg-surface">
        <main className="flex min-h-dvh items-center justify-center px-4">
          <ErrorState
            title={`${BRAND} hit a problem`}
            description={
              error.digest
                ? `Something went wrong loading the app (ref ${error.digest}). Reloading usually fixes this.`
                : "Something went wrong loading the app. Reloading usually fixes this."
            }
            action={
              <Button onClick={() => window.location.reload()}>Reload {BRAND}</Button>
            }
          />
        </main>
      </body>
    </html>
  );
}
