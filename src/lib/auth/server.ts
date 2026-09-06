import type { Session, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";

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
 *
 * `React.cache()` (here and on every export below) memoizes per request:
 * the root layout and every protected page call into this module on the
 * same request, and without it each of those calls re-hit the Supabase auth
 * server independently (`docs/qa/perf2/WATERFALL.md`) even though the answer
 * cannot change mid-request. This only dedupes within one render pass — it
 * is not a cross-request cache, and it never widens what a caller can see.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session;
});

/**
 * The signed-in user, verified against the auth server. `null` when signed
 * out, and also `null` (rather than throwing) when Supabase is not
 * configured — every caller degrades to the signed-out UI, never a crash.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return data.user;
});

/**
 * The signed-in user's profile row, mapped to the domain `Profile` shape.
 * `null` when signed out. Built on the cached `getCurrentUser` above rather
 * than its own `auth.getUser()` call, so it shares that call's memoized
 * result with every other caller on the same request.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  const supabase = await createServerSupabaseClient();
  return getProfileById(supabase, user.id);
});

/**
 * `getCurrentUser` + `getCurrentProfile` in a single call, both already
 * request-memoized above. Used by the root layout to hydrate `AuthProvider`
 * without doubling the auth-server call every request makes anyway.
 */
export const getCurrentUserWithProfile = cache(async (): Promise<{
  user: User | null;
  profile: Profile | null;
}> => {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, profile: null };
  }
  const profile = await getCurrentProfile();
  return { user, profile };
});

/**
 * True when `profiles.suspended_until` (migration 23) is set to a moment
 * still in the future. A `null` column or a past timestamp both mean "not
 * suspended" — this never auto-expires the column itself, it just stops
 * treating an elapsed suspension as active.
 */
function isSuspended(suspendedUntil: string | null): boolean {
  if (!suspendedUntil) {
    return false;
  }
  return new Date(suspendedUntil).getTime() > Date.now();
}

/** Shown by a Server Action that refuses a mutation because the caller is suspended (spec §26, §32). */
export const SUSPENDED_ACTION_MESSAGE =
  "Your account is temporarily suspended, so this action isn't available right now.";

/**
 * Server Action suspension guard (spec §26, §32, Stage 14 audit) — the
 * mutation-path complement to `requireUser`'s redirect-based check below.
 * `requireUser` only runs at page-load time (every protected Server
 * Component), so a Server Action reached directly — a tab left open from
 * before the suspension took effect, or a client bypassing the UI entirely —
 * never goes through it. Every mutating Server Action that inserts/updates on
 * behalf of the caller should call this immediately after resolving the
 * signed-in user and refuse the action (never throw to the client) when it
 * returns `false`, matching this codebase's "blocked user attempts a direct
 * API call bypassing the UI -> DENIED" standard for suspension too.
 *
 * Returns `true` when the assertion holds (the account is NOT suspended, the
 * caller may proceed); `false` when `profiles.suspended_until` is still in
 * the future.
 */
export async function assertNotSuspended(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return true;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("profiles")
    .select("suspended_until")
    .eq("id", userId)
    .maybeSingle();
  return !(data && isSuspended(data.suspended_until));
}

/**
 * Require a signed-in user, redirecting to `/login?next=<path>` otherwise.
 * `nextPath` should be the path (plus query string) to return to after
 * signing in — pass the current route from the calling Server Component.
 *
 * Also enforces suspension (spec §26, migration 23:
 * `resolve_report(..., 'suspend_user')`): a suspended account is redirected
 * to `/suspended` instead of reaching the page it asked for. This is the
 * ONE call site that checks it, since every protected page already calls
 * `requireUser`/`requireOnboarded` (both route through here) as its
 * authorization boundary (see the route protection matrix in
 * `docs/SECURITY.md`) — `/suspended` itself must never call `requireUser`,
 * or a suspended visitor would bounce in a redirect loop; it reads
 * `getCurrentUser()` directly instead.
 *
 * Reads suspension off `getCurrentProfile()` (perf3, `docs/qa/perf3/WATERFALL.md`)
 * instead of its own `profiles.suspended_until` query: the root layout
 * already calls `getCurrentUserWithProfile()` on every request, so the
 * `React.cache()`-memoized profile fetch is free here rather than a second
 * round trip to Supabase for a single column.
 */
export async function requireUser(nextPath?: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(routes.login(nextPath));
  }

  if (isSupabaseConfigured()) {
    const profile = await getCurrentProfile();
    if (profile && isSuspended(profile.suspendedUntil)) {
      redirect(routes.suspended());
    }
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
