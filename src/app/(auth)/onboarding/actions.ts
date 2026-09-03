"use server";

import { completeOnboardingSchema } from "@/lib/validation/profiles";
import type { AuthActionResult } from "@/lib/auth/types";
import { fieldErrorsFromZod } from "@/lib/auth/types";
import { getCurrentUser } from "@/lib/auth/server";
import { followProfile } from "@/lib/db/follows";
import { completeOnboarding as completeOnboardingRow } from "@/lib/db/profiles";
import { DatabaseError } from "@/lib/db/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/common";

/**
 * Server Actions for `/onboarding` (spec §8). Called directly from
 * `OnboardingFlow.tsx` — a multi-step client wizard accumulating state
 * across steps rather than one native form per step — instead of being bound
 * to a `<form action>`, but the return contract stays the same as every
 * other auth-adjacent action: `{ ok, fieldErrors, formError }`, never throw.
 */

export interface CompleteOnboardingInput {
  username: string;
  displayName: string | null;
  interests: string[];
}

export async function completeOnboarding(input: CompleteOnboardingInput): Promise<AuthActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, formError: "Your session has expired. Sign in again to continue." };
  }

  const parsed = completeOnboardingSchema.safeParse({
    username: input.username,
    display_name: input.displayName,
    interests: input.interests,
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error.flatten().fieldErrors) };
  }

  const supabase = await createServerSupabaseClient();

  try {
    await completeOnboardingRow(supabase, user.id, parsed.data);
  } catch (error) {
    if (error instanceof DatabaseError && error.code === "23505") {
      return { ok: false, fieldErrors: { username: "That username is taken." } };
    }
    return { ok: false, formError: "Could not save your details. Try again." };
  }

  return { ok: true };
}

/** Best-effort follow from the "suggested creators" step — never blocks the wizard. */
export async function followSuggestedCreator(followeeId: string): Promise<AuthActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, formError: "Your session has expired. Sign in again to continue." };
  }

  const parsedId = uuidSchema.safeParse(followeeId);
  if (!parsedId.success) {
    return { ok: false, formError: "Invalid profile." };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await followProfile(supabase, user.id, parsedId.data);
  } catch {
    return { ok: false, formError: "Could not follow that creator. Try again." };
  }

  return { ok: true };
}
