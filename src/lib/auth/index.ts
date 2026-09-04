/**
 * Client-safe auth exports only. `./server` (`getCurrentUser`,
 * `getCurrentProfile`, `getSession`, `requireUser`, `requireOnboarded`) is
 * deliberately NOT re-exported here — it imports `next/headers`, which must
 * never end up in a client bundle. Server Components/Actions import it
 * directly: `import { requireUser } from "@/lib/auth/server"`. This mirrors
 * `src/lib/supabase`, which has no barrel for the same reason.
 */
export { AuthProvider, useCurrentUser, type AuthProviderProps, type CurrentUserState } from "./AuthProvider";
export { mapAuthError, type AuthErrorLike } from "./errors";
export { AUTH_ACTION_INITIAL_STATE, fieldErrorsFromZod, type AuthActionResult } from "./types";
export { useAuthRedirect } from "./useAuthRedirect";
