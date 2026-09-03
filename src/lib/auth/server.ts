import type { Session, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { routes } from "@/config/routes";
import { getProfileById } from "@/lib/db/profiles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/domain";

/**
 * Server-side auth reads for Server Components, Server Actions and Route
 * Handlers. `src/lib/supabase/server.ts` owns the raw client factory; this
 * module is the auth *domain* API built on top of it — profile hydration,
 * onboarding state and the redirect helpers every protected page uses.
 *
 * `src/proxy.ts` already redirects unauthenticated/not-onboarded visitors
 * away from protected routes, but that is a UX convenience running on the
 * edge, not the authorization boundary (see `docs/SECURITY.md`). Every
 * protected page calls `requireUser`/`requireOnboarded` itself too, so a
 * proxy misconfiguration or matcher gap never leaves a page trusting an
 * unauthenticated request.
 */

/**
 * The raw, cookie-trusting session. Fast, but NOT verified against the auth
 * server — never use this for an authorization decision. Good for "does a
 * session cookie exist at all" checks where being wrong isn't a security bug
 * (e.g. deciding whether to render a skeleton while the real check resolves).
 */
export async function getSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * The signed-in user, verified against the auth server. `null` when signed
 * out, and also `null` (rather than throwing) when Supabase is not
 * configured — every caller degrades to the signed-out UI, never a crash.
 */
export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return data.user;
}

/** The signed-in user's profile row, mapped to the domain `Profile` shape. `null` when signed out. */
export async function getCurrentProfile(): Promise<Profile | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return getProfileById(supabase, data.user.id);
}

/**
 * `getCurrentUser` + `getCurrentProfile` in a single request: one client, one
 * `getUser()` round trip. Used by the root layout to hydrate `AuthProvider`
 * without doubling the auth-server call every request makes anyway.
 */
export async function getCurrentUserWithProfile(): Promise<{
  user: User | null;
  profile: Profile | null;
}> {
  if (!isSupabaseConfigured()) {
    return { user: null, profile: null };
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { user: null, profile: null };
  }
  const profile = await getProfileById(supabase, data.user.id);
  return { user: data.user, profile };
}

/**
 * Require a signed-in user, redirecting to `/login?next=<path>` otherwise.
 * `nextPath` should be the path (plus query string) to return to after
 * signing in — pass the current route from the calling Server Component.
 */
export async function requireUser(nextPath?: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(routes.login(nextPath));
  }
  return user;
}

/**
 * Require a signed-in, onboarded user. Onboarding is skippable (spec §8) —
 * this exists for the handful of surfaces where it genuinely makes sense to
 * nudge a brand-new account back to onboarding (mirrors the proxy redirect),
 * not to hard-block browsing. `/onboarding` itself must never call this.
 */
export async function requireOnboarded(
  nextPath?: string,
): Promise<{ user: User; profile: Profile }> {
  const user = await requireUser(nextPath);
  const supabase = await createServerSupabaseClient();
  const profile = await getProfileById(supabase, user.id);
  if (!profile) {
    // The signup trigger creates the profile row synchronously; a signed-in
    // user with no row is a data integrity problem, not a routing decision.
    redirect(routes.login(nextPath));
  }
  if (!profile.onboardedAt) {
    redirect(routes.onboarding(nextPath));
  }
  return { user, profile };
}
