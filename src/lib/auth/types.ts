/**
 * Shared shape for every auth Server Action (`src/app/(auth)/actions.ts`).
 *
 * Actions never throw to the client (dev rule 9 — never fake functionality,
 * but also never surface a stack trace as UI). Validation failures populate
 * `fieldErrors`; anything else (a rejected Supabase call, a mapped auth
 * error) populates `formError`. `ok` is `true` only when the action fully
 * succeeded and requires no redirect from here (a successful sign-in/sign-up
 * instead throws Next's internal redirect signal via `redirect()`, so callers
 * mostly see this shape on the *failure* path).
 */
export interface AuthActionResult {
  ok: boolean;
  fieldErrors?: Record<string, string>;
  formError?: string;
  /** Success copy for actions that don't redirect (e.g. "check your email"). */
  message?: string;
}

export const AUTH_ACTION_INITIAL_STATE: AuthActionResult = { ok: false };

/** Flatten a Zod `safeParse` failure into the single-message-per-field shape every form expects. */
export function fieldErrorsFromZod(fieldErrors: Record<string, string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (messages && messages.length > 0) {
      result[key] = messages[0];
    }
  }
  return result;
}
