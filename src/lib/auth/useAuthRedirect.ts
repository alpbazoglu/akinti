"use client";

import { useEffect } from "react";

import type { AuthActionResult } from "./types";

/**
 * Performs the hard navigation for an auth Server Action that returned
 * `redirectTo` instead of calling `redirect()` itself — see the doc comment
 * on `AuthActionResult.redirectTo` (`src/lib/auth/types.ts`) for why:
 * `signIn` (`src/app/(auth)/actions.ts`) hit a reproducible bug where a
 * server-action `redirect()`'s client-side transition did not reliably
 * carry the just-set auth cookie, rendering the destination signed-out
 * despite a valid session. `window.location.assign` guarantees a fresh,
 * fully server-rendered load that always reflects the current session.
 *
 * Call with the `AuthActionResult` state from `useActionState` — a no-op
 * whenever `redirectTo` isn't set (every failure path, and every action
 * that doesn't redirect at all).
 */
export function useAuthRedirect(state: AuthActionResult): void {
  useEffect(() => {
    if (state.ok && state.redirectTo) {
      window.location.assign(state.redirectTo);
    }
  }, [state.ok, state.redirectTo]);
}
