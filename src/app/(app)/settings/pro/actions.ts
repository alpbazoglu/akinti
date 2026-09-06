"use server";

/**
 * Server Actions backing AKINTI Pro (Wave F, PRODUCT_V2 §4/§5). Screen owned
 * by a later frontend wave (docs/BILLING.md has the flow write-up for
 * whoever builds it) — this file is the action layer only.
 *
 * Same contract as every other action module in this codebase
 * (`src/app/(app)/challenges/actions.ts` is the closest sibling): parse with
 * Zod, never throw to the client, always return `{ ok, fieldErrors?,
 * formError?, message?, data? }`.
 *
 * `startProCheckout`/`cancelPro` need the service-role admin client — every
 * write to `plans`/`subscriptions`/`billing_events` and the direct
 * `check_rate_limit`/`record_rate_limit_event` RPC calls are revoked from
 * `authenticated` (migration `20260906100000_subscriptions.sql`) — but only
 * ever reach it after `getCurrentUser()` has already established who is
 * asking, exactly like `finalizeUpload` (`src/app/(app)/create/actions.ts`)
 * does for its own admin-client calls.
 */

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { assertNotSuspended, getCurrentProfile, getCurrentUser, SUSPENDED_ACTION_MESSAGE } from "@/lib/auth/server";
import { fieldErrorsFromZod } from "@/lib/auth/types";
import { cancelSubscriptionForUser, isPro, resumeSubscriptionForUser, startCheckout } from "@/lib/billing";
import { BillingProviderError } from "@/lib/billing/types";
import type { IyzicoBuyerDetails } from "@/lib/billing/types";
import { DatabaseError } from "@/lib/db/types";
import { isRateLimitError } from "@/lib/moderation/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { translateFieldErrors, type MessageTranslator } from "@/lib/validation/translate";
import type { PlanCode, SubscriptionStatus } from "@/types/database";

/** Postgres unique_violation — a second checkout beat this one to recording its `subscriptions` row. */
const UNIQUE_VIOLATION = "23505";

export interface ProActionResult<T = undefined> {
  readonly ok: boolean;
  readonly fieldErrors?: Record<string, string>;
  readonly formError?: string;
  readonly message?: string;
  readonly data?: T;
}

interface ProActionFailure {
  readonly ok: false;
  readonly fieldErrors?: Record<string, string>;
  readonly formError?: string;
}

async function requireSignedIn(): Promise<
  | { userId: string; email: string; name: string; error: null }
  | { userId: null; email: null; name: null; error: ProActionFailure }
> {
  if (!isSupabaseConfigured()) {
    const t = await getTranslations("Common");
    return { userId: null, email: null, name: null, error: { ok: false, formError: t("notConfigured") } };
  }
  const user = await getCurrentUser();
  if (!user || !user.email) {
    const t = await getTranslations("Common");
    return { userId: null, email: null, name: null, error: { ok: false, formError: t("signInToContinue") } };
  }
  if (!(await assertNotSuspended(user.id))) {
    return { userId: null, email: null, name: null, error: { ok: false, formError: SUSPENDED_ACTION_MESSAGE } };
  }
  const profile = await getCurrentProfile();
  return { userId: user.id, email: user.email, name: profile?.displayName || user.email, error: null };
}

function describeError(err: unknown, fallback: string, t: MessageTranslator): string {
  if (isRateLimitError(err)) {
    return t("Common.rateLimited");
  }
  if (err instanceof BillingProviderError) {
    return err.message;
  }
  if (err instanceof DatabaseError && err.code === UNIQUE_VIOLATION) {
    return t("SettingsProActions.checkoutInProgress");
  }
  return fallback;
}

const PLAN_CODES = ["pro_monthly_try", "pro_yearly_try", "pro_monthly_usd", "pro_yearly_usd"] as const;

const iyzicoBuyerSchema = z.object({
  identityNumber: z.string().trim().min(5).max(11),
  gsmNumber: z.string().trim().min(7).max(20),
  address: z.string().trim().min(5).max(400),
  city: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(120),
  zipCode: z.string().trim().max(20).optional(),
});

const startProCheckoutSchema = z.object({
  planCode: z.enum(PLAN_CODES),
  returnUrl: z.string().url(),
  /** Required only for a `_try` plan (iyzico) — validated against that at runtime, not by this schema alone. */
  buyer: iyzicoBuyerSchema.optional(),
});

export interface StartProCheckoutInput {
  planCode: PlanCode;
  returnUrl: string;
  buyer?: IyzicoBuyerDetails;
}

/**
 * Start a Pro checkout. Returns a redirect URL (Paddle) or an iyzico
 * Checkout Form to embed (`checkoutFormToken`/`checkoutFormContent`) — see
 * `docs/BILLING.md` "Checkout flow" for what the caller does with each.
 *
 * `transactionId` (Wave F frontend addition): the Pro screen
 * (`src/components/pro/`) opens Paddle's checkout as an in-page overlay via
 * `@paddle/paddle-js`'s `Checkout.open({ transactionId })`, per this wave's
 * brief — not a plain redirect to `redirectUrl`, even though that URL is
 * also a real, working hosted checkout page. `result.providerRef` already
 * *is* that transaction id for Paddle (see `CreateCheckoutResult.providerRef`'s
 * doc comment in `src/lib/billing/types.ts`); this field just surfaces it
 * to the client, additively, alongside the two fields already returned.
 */
export async function startProCheckout(
  input: StartProCheckoutInput,
): Promise<
  ProActionResult<{
    redirectUrl: string | null;
    checkoutFormToken: string | null;
    checkoutFormContent: string | null;
    transactionId: string | null;
  }>
> {
  const parsed = startProCheckoutSchema.safeParse(input);
  const t = (await getTranslations()) as MessageTranslator;
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(translateFieldErrors(t, parsed.error.flatten().fieldErrors)) };
  }
  if (parsed.data.planCode.endsWith("_try") && !parsed.data.buyer) {
    return { ok: false, fieldErrors: { buyer: t("SettingsProActions.buyerRequired") } };
  }

  const signedIn = await requireSignedIn();
  if (signedIn.error) return signedIn.error;

  const admin = createAdminClient();
  try {
    const result = await startCheckout(admin, {
      userId: signedIn.userId,
      userEmail: signedIn.email,
      userName: signedIn.name,
      planCode: parsed.data.planCode,
      returnUrl: parsed.data.returnUrl,
      buyer: parsed.data.buyer,
    });

    return {
      ok: true,
      message: t("SettingsProActions.checkoutStarted"),
      data: {
        redirectUrl: result.redirectUrl,
        checkoutFormToken: result.redirectUrl ? null : result.providerRef,
        checkoutFormContent: result.checkoutFormContent ?? null,
        transactionId: result.redirectUrl ? result.providerRef : null,
      },
    };
  } catch (err) {
    return { ok: false, formError: describeError(err, t("SettingsProActions.checkoutStartFailed"), t) };
  }
}

/** Cancel the caller's AKINTI Pro subscription. The provider confirms the actual end date; `cancel_at_period_end` reflects the request immediately, `status` flips to `canceled` once the webhook lands (never faked here). */
export async function cancelPro(): Promise<ProActionResult> {
  const signedIn = await requireSignedIn();
  if (signedIn.error) return signedIn.error;

  const admin = createAdminClient();
  const t = (await getTranslations()) as MessageTranslator;
  try {
    await cancelSubscriptionForUser(admin, signedIn.userId);
  } catch (err) {
    return { ok: false, formError: describeError(err, t("SettingsProActions.cancelFailed"), t) };
  }

  return { ok: true, message: t("SettingsProActions.cancelScheduled") };
}

/**
 * Undo a pending cancel-at-period-end (docs/BILLING.md "Resume"). iyzico
 * subscriptions can't be resumed this way — `resumeSubscriptionForUser`
 * throws a `BillingProviderError` in that case, surfaced here as an honest
 * `formError` rather than a silent no-op, so the Pro screen can point the
 * caller at starting a new subscription instead.
 */
export async function resumePro(): Promise<ProActionResult> {
  const signedIn = await requireSignedIn();
  if (signedIn.error) return signedIn.error;

  const admin = createAdminClient();
  const t = (await getTranslations()) as MessageTranslator;
  try {
    await resumeSubscriptionForUser(admin, signedIn.userId);
  } catch (err) {
    return { ok: false, formError: describeError(err, t("SettingsProActions.resumeFailed"), t) };
  }

  return { ok: true, message: t("SettingsProActions.resumeSucceeded") };
}

export interface ProStatus {
  isPro: boolean;
  status: SubscriptionStatus | null;
  planCode: PlanCode | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/** Read-only: the caller's own Pro status, via their own (RLS-scoped) client — no admin client needed, since `subscriptions_select_own` already lets a user read their own row. */
export async function getProStatus(): Promise<ProActionResult<ProStatus>> {
  if (!isSupabaseConfigured()) {
    const t = await getTranslations("Common");
    return { ok: false, formError: t("notConfigured") };
  }
  const user = await getCurrentUser();
  if (!user) {
    const t = await getTranslations("Common");
    return { ok: false, formError: t("signInToContinue") };
  }

  const db = await createServerSupabaseClient();

  const [entitled, subscriptionResult] = await Promise.all([
    isPro(db, user.id).catch(() => false),
    db
      .from("subscriptions")
      .select("status, current_period_end, cancel_at_period_end, plan_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (subscriptionResult.error) {
    const t = await getTranslations("SettingsProActions");
    return { ok: false, formError: t("loadFailed") };
  }

  const subscription = subscriptionResult.data;
  if (!subscription) {
    return { ok: true, data: { isPro: entitled, status: null, planCode: null, currentPeriodEnd: null, cancelAtPeriodEnd: false } };
  }

  // `plans` is a public, readable-to-everyone catalog (RLS `plans_select`) —
  // the caller's own client is enough, no admin client needed for this read.
  const planResult = await db.from("plans").select("code").eq("id", subscription.plan_id).maybeSingle();

  return {
    ok: true,
    data: {
      isPro: entitled,
      status: subscription.status,
      planCode: planResult.data?.code ?? null,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  };
}
