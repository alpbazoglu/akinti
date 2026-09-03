"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";

import { getProfileById } from "@/lib/db/profiles";
import { createClient, type SupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Profile } from "@/types/domain";

export interface CurrentUserState {
  user: User | null;
  profile: Profile | null;
  /** Re-read the profile row from the database, e.g. after onboarding or a settings edit. */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<CurrentUserState | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
  /** Server-verified user for the request that rendered the root layout. */
  initialUser: User | null;
  /** Matching profile row, already hydrated so first paint never flashes "signed out". */
  initialProfile: Profile | null;
}

/**
 * Client-side auth state, hydrated from the server render and kept in sync
 * with Supabase's own auth listener. Mounted once in `src/app/providers.tsx`.
 *
 * The server already decided `initialUser`/`initialProfile` for this request
 * (`getCurrentUser`/`getCurrentProfile` in `src/lib/auth/server.ts`), so the
 * first client render matches the server render exactly — no
 * hydration-mismatch flash between "signed out" and "signed in". After that,
 * `onAuthStateChange` is the single source of truth for sign-in/sign-out
 * happening in this tab (a Server Action redirect) or another one.
 */
export function AuthProvider({ children, initialUser, initialProfile }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  // Lazy `useState` initializer, not `useMemo`: this must run exactly once
  // and never be silently discarded/recomputed the way `useMemo` is allowed
  // to (e.g. under React's memory-pressure cache eviction) — a re-created
  // client would drop the in-flight `onAuthStateChange` subscription below.
  const [client] = useState<SupabaseBrowserClient | null>(() =>
    isSupabaseConfigured() ? createClient() : null,
  );

  const loadProfile = useCallback(async (userId: string) => {
    if (!client) {
      return;
    }
    try {
      setProfile(await getProfileById(client, userId));
    } catch {
      // RLS-hidden or transiently unreachable — fall back to "no profile"
      // rather than throwing out of an auth-state callback.
      setProfile(null);
    }
  }, [client]);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    await loadProfile(user.id);
  }, [user, loadProfile]);

  useEffect(() => {
    if (!client) {
      return;
    }

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        void loadProfile(nextUser.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [client, loadProfile]);

  const value = useMemo<CurrentUserState>(
    () => ({ user, profile, refreshProfile }),
    [user, profile, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** The signed-in user and profile, live-updated via Supabase's auth listener. */
export function useCurrentUser(): CurrentUserState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useCurrentUser must be used inside <AuthProvider>.");
  }
  return context;
}
