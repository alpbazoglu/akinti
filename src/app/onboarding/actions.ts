"use server";

import { getTranslations } from "next-intl/server";

import { completeOnboardingSchema } from "@/lib/validation/profiles";
import { usernameSchema } from "@/lib/validation/common";
import type { AuthActionResult } from "@/lib/auth/types";
import { fieldErrorsFromZod } from "@/lib/auth/types";
import { getCurrentUser } from "@/lib/auth/server";
import { completeOnboarding as completeOnboardingRow, isUsernameAvailable } from "@/lib/db/profiles";
import { DatabaseError } from "@/lib/db/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { translateFieldErrors, type MessageTranslator } from "@/lib/validation/translate";

/**
 * Server Actions for `/onboarding` (SCREENS.md §1). Called directly from
 * `OnboardingFlow.tsx` — a three-step client wizard accumulating state
 * across steps rather than one native form per step — instead of being bound
 * to a `<form action>`, but the return contract stays the same as every
 * other auth-adjacent action: `{ ok, fieldErrors, formError }`, never throw.
 */

export interface CompleteOnboardingInput {
  username: string;
  displayName: string | null;
}

export async function completeOnboarding(input: CompleteOnboardingInput): Promise<AuthActionResult> {
  const user = await getCurrentUser();
  const t = (await getTranslations()) as MessageTranslator;
  if (!user) {
    return { ok: false, formError: t("Common.sessionExpired") };
  }

  const parsed = completeOnboardingSchema.safeParse({
    username: input.username,
    display_name: input.displayName,
    interests: [],
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(translateFieldErrors(t, parsed.error.flatten().fieldErrors)) };
  }

  const supabase = await createServerSupabaseClient();

  try {
    await completeOnboardingRow(supabase, user.id, parsed.data);
  } catch (error) {
    if (error instanceof DatabaseError && error.code === "23505") {
      return { ok: false, fieldErrors: { username: t("Common.usernameTaken") } };
    }
    return { ok: false, formError: t("OnboardingActions.saveFailed") };
  }

  return { ok: true };
}

/**
 * The signal tick beside the handle field on step three (§1.3): a small,
 * inline availability check, never a green banner or a toast. Malformed
 * input (too short, bad characters) reads as "unavailable" rather than
 * surfacing a separate validation error here — the field's own on-blur
 * validation covers that.
 */
export async function checkUsernameAvailable(
  username: string,
): Promise<{ available: boolean }> {
  const user = await getCurrentUser();
  if (!user) {
    return { available: false };
  }

  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) {
    return { available: false };
  }

  const supabase = await createServerSupabaseClient();
  const available = await isUsernameAvailable(supabase, parsed.data, user.id);
  return { available };
}
