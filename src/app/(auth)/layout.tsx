import type { ReactNode } from "react";
import Link from "next/link";

import { routes } from "@/config/routes";
import { BRAND, BRAND_TAGLINE } from "@/config/terminology";

/** Minimal centred layout for sign-in, sign-up and onboarding. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="akinti-page flex min-h-dvh flex-col justify-center py-10">
      <main id="main" className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-start gap-2">
          <Link
            href={routes.home()}
            className="inline-flex items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <span className="type-wordmark text-ink">{BRAND}</span>
          </Link>
          <p className="type-body-sm measure text-ink-muted">{BRAND_TAGLINE}</p>
        </div>
        {children}
      </main>
    </div>
  );
}
