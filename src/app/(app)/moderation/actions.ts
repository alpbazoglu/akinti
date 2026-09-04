"use server";

/**
 * Moderation queue Server Actions (spec §26, migration 23). Same contract as
 * every other action module in this codebase (`src/app/(app)/settings/actions.ts`
 * is the closest sibling): parse with Zod, never throw to the client, always
 * return `{ ok, formError?, message? }`.
 *
 * Authorization is never re-implemented here — `claim_report`/
 * `resolve_report`/`dismiss_report` (migration 23) independently re-check
 * `is_moderator()` server-side regardless of what this file does. The
 * pre-check below exists only to turn "you're not a moderator" into an
 * honest, specific message instead of a raw Postgres error, mirroring every
 * other Server Action in this codebase.
 */

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth/server";
import type { AuthActionResult } from "@/lib/auth/types";
import { fieldErrorsFromZod } from "@/lib/auth/types";
import { claimReport, dismissReport, isModerator, resolveReport } from "@/lib/db/moderation";
import { mapModerationError } from "@/lib/moderation/errors";
import { routes } from "@/config/routes";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { claimReportSchema, dismissReportSchema, resolveReportSchema } from "@/lib/validation/moderation";

const NOT_CONFIGURED_ERROR =
  "This isn't connected to a backend yet — Supabase environment variables are not set.";
const NOT_MODERATOR_ERROR = "You don't have access to the moderation queue.";

async function requireModerator() {
  if (!isSupabaseConfigured()) {
    return { db: null, result: { ok: false, formError: NOT_CONFIGURED_ERROR } satisfies AuthActionResult };
  }
  const user = await getCurrentUser();
  if (!user) {
    return {
      db: null,
      result: { ok: false, formError: "Your session has expired. Sign in again to continue." } satisfies AuthActionResult,
    };
  }
  const db = await createServerSupabaseClient();
  if (!(await isModerator(db))) {
    return { db: null, result: { ok: false, formError: NOT_MODERATOR_ERROR } satisfies AuthActionResult };
  }
  return { db, result: null };
}

export async function claimReportAction(reportId: string): Promise<AuthActionResult> {
  const parsed = claimReportSchema.safeParse({ reportId });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error.flatten().fieldErrors) };
  }

  const { db, result } = await requireModerator();
  if (!db) return result!;

  try {
    await claimReport(db, parsed.data.reportId);
  } catch (error) {
    return { ok: false, formError: mapModerationError(error, "Could not claim this report. Try again.") };
  }

  revalidatePath(routes.moderation());
  return { ok: true, message: "Report claimed — status is now Reviewing." };
}

export async function resolveReportAction(input: {
  reportId: string;
  action: string;
  note?: string | null;
}): Promise<AuthActionResult> {
  const parsed = resolveReportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error.flatten().fieldErrors) };
  }

  const { db, result } = await requireModerator();
  if (!db) return result!;

  try {
    await resolveReport(db, {
      reportId: parsed.data.reportId,
      action: parsed.data.action,
      note: parsed.data.note,
    });
  } catch (error) {
    return { ok: false, formError: mapModerationError(error, "Could not resolve this report. Try again.") };
  }

  revalidatePath(routes.moderation());
  return { ok: true, message: "Report resolved." };
}

export async function dismissReportAction(input: {
  reportId: string;
  note?: string | null;
}): Promise<AuthActionResult> {
  const parsed = dismissReportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error.flatten().fieldErrors) };
  }

  const { db, result } = await requireModerator();
  if (!db) return result!;

  try {
    await dismissReport(db, parsed.data.reportId, parsed.data.note);
  } catch (error) {
    return { ok: false, formError: mapModerationError(error, "Could not dismiss this report. Try again.") };
  }

  revalidatePath(routes.moderation());
  return { ok: true, message: "Report dismissed." };
}
