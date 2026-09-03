import type { ReactNode } from "react";
import Link from "next/link";
import { AudioLines } from "lucide-react";

import { routes } from "@/config/routes";
import { BRAND, BRAND_TAGLINE } from "@/config/terminology";

/** Minimal centred layout for sign-in, sign-up and onboarding. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <main id="main" className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Link
            href={routes.home()}
            className="inline-flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <AudioLines className="size-6 text-accent" aria-hidden="true" />
            <span className="text-lg font-semibold tracking-[0.18em] text-fg">{BRAND}</span>
          </Link>
          <p className="text-sm text-fg-muted">{BRAND_TAGLINE}</p>
        </div>
        {children}
      </main>
    </div>
  );
}
