"use client";

import type { User } from "@supabase/supabase-js";
import type { ReactNode } from "react";

import { PlaybackProvider } from "@/lib/audio";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/ui";
import type { Profile } from "@/types/domain";

export interface ProvidersProps {
  children: ReactNode;
  initialUser: User | null;
  initialProfile: Profile | null;
}

/**
 * Client providers mounted once at the root.
 *
 * `PlaybackProvider` owns the single `<audio>` element for the whole app, which
 * is what makes the "one Wave at a time" rule true across routes rather than
 * per page (spec section 12). `AuthProvider` is hydrated from the server render
 * (`src/app/layout.tsx`) so the first client paint already knows who's signed in.
 */
export function Providers({ children, initialUser, initialProfile }: ProvidersProps) {
  return (
    <AuthProvider initialUser={initialUser} initialProfile={initialProfile}>
      <PlaybackProvider>
        <ToastProvider>{children}</ToastProvider>
      </PlaybackProvider>
    </AuthProvider>
  );
}
