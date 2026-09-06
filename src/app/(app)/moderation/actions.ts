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
import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "@/lib/auth/server";
import type { AuthActionResult } from "@/lib/auth/types";
import { fieldErrorsFromZod } from "@/lib/auth/types";
import { claimReport, dismissReport, isModerator, resolveReport } from "@/lib/db/moderation";
import { mapModerationError } from "@/lib/moderation/errors";
import { routes } from "@/config/routes";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { claimReportSchema, dismissReportSchema, resolveReportSchema } from "@/lib/validation/moderation";
import { translateFieldErrors, type MessageTranslator } from "@/lib/validation/translate";

async function requireModerator() {
  if (!isSupabaseConfigured()) {
    const t = await getTranslations("Common");
    return { db: null, result: { ok: false, formError: t("notConnected") } satisfies AuthActionResult };
  }
  const user = await getCurrentUser();
  if (!user) {
    const t = await getTranslations("Common");
    return {
      db: null,
      result: { ok: false, formError: t("sessionExpired") } satisfies AuthActionResult,
    };
  }
  const db = await createServerSupabaseClient();
  if (!(await isModerator(db))) {
    const t = await getTranslations("ModerationActions");
    return { db: null, result: { ok: false, formError: t("notModerator") } satisfies AuthActionResult };
  }
  return { db, result: null };
}

export async function claimReportAction(reportId: string): Promise<AuthActionResult> {
  const parsed = claimReportSchema.safeParse({ reportId });
  const t = (await getTranslations()) as MessageTranslator;
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(translateFieldErrors(t, parsed.error.flatten().fieldErrors)) };
  }

  const { db, result } = await requireModerator();
  if (!db) return result!;

  try {
    await claimReport(db, parsed.data.reportId);
  } catch (error) {
    return { ok: false, formError: mapModerationError(error, t("ModerationActions.claimFailed"), t) };
  }

  revalidatePath(routes.moderation());
  return { ok: true, message: t("ModerationActions.claimed") };
}

export async function resolveReportAction(input: {
  reportId: string;
  action: string;
  note?: string | null;
}): Promise<AuthActionResult> {
  const parsed = resolveReportSchema.safeParse(input);
  const t = (await getTranslations()) as MessageTranslator;
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(translateFieldErrors(t, parsed.error.flatten().fieldErrors)) };
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
    return { ok: false, formError: mapModerationError(error, t("ModerationActions.resolveFailed"), t) };
  }

  revalidatePath(routes.moderation());
  return { ok: true, message: t("ModerationActions.resolved") };
}

export async function dismissReportAction(input: {
  reportId: string;
  note?: string | null;
}): Promise<AuthActionResult> {
  const parsed = dismissReportSchema.safeParse(input);
  const t = (await getTranslations()) as MessageTranslator;
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(translateFieldErrors(t, parsed.error.flatten().fieldErrors)) };
  }

  const { db, result } = await requireModerator();
  if (!db) return result!;

  try {
    await dismissReport(db, parsed.data.reportId, parsed.data.note);
  } catch (error) {
    return { ok: false, formError: mapModerationError(error, t("ModerationActions.dismissFailed"), t) };
  }

  revalidatePath(routes.moderation());
  return { ok: true, message: t("ModerationActions.dismissed") };
}
