"use client";

import type { ReactNode } from "react";

import { PlaybackProvider } from "@/lib/audio";
import { ToastProvider } from "@/components/ui";

export interface ProvidersProps {
  children: ReactNode;
}

/**
 * Client providers mounted once at the root.
 *
 * `PlaybackProvider` owns the single `<audio>` element for the whole app, which
 * is what makes the "one Wave at a time" rule true across routes rather than
 * per page (spec section 12).
 */
export function Providers({ children }: ProvidersProps) {
  return (
    <PlaybackProvider>
      <ToastProvider>{children}</ToastProvider>
    </PlaybackProvider>
  );
}
