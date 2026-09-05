"use client";

import type { User } from "@supabase/supabase-js";
import type { ReactNode } from "react";

import { PlaybackProvider } from "@/lib/audio";
import { AuthProvider } from "@/lib/auth";
import { MotionProvider } from "@/lib/motion";
import { GrainGuard } from "@/components/layout/GrainGuard";
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
 * `PlaybackProvider` owns the single `<audio>` element and the single
 * WaveSurfer instance bound to it, which is what makes "one Wave at a time"
 * true across routes rather than per page. `AuthProvider` is hydrated from the
 * server render so the first client paint already knows who is signed in.
 * `MotionProvider` loads Motion's DOM feature bundle once
 * (`docs/research/libraries.md` §5).
 */
export function Providers({ children, initialUser, initialProfile }: ProvidersProps) {
  return (
    <AuthProvider initialUser={initialUser} initialProfile={initialProfile}>
      <MotionProvider>
        <PlaybackProvider>
          <ToastProvider>
            <GrainGuard />
            {children}
          </ToastProvider>
        </PlaybackProvider>
      </MotionProvider>
    </AuthProvider>
  );
}
