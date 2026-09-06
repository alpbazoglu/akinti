import "server-only";

import type { SupabaseAdminClient } from "@/lib/supabase/admin";
import { DatabaseError, unwrapMaybe } from "@/lib/db/types";
import type { BillingProvider, Json, PlanCode, PlanRow, SubscriptionRow, SubscriptionStatus } from "@/types/database";

import type { ParsedBillingEvent } from "./types";

/**
 * All `plans`/`subscriptions`/`billing_events` reads and writes, in one
 * place, always through the service-role admin client — none of these three
 * tables grants a client role an insert/update/delete path (migration
 * `20260906100000_subscriptions.sql`'s RLS section explains why), so every
 * caller here is already a Server Action or a webhook route running with
 * the service role.
 */

/** A user's own subscription is readable through RLS with their own client too (`subscriptions_select_own`) — that path is `getProStatus`'s (`settings/pro/actions.ts`), not this module's. Every function here specifically needs the service role because it writes, or reads across users (webhook correlation). */

export async function getPlanByCode(admin: SupabaseAdminClient, code: PlanCode): Promise<PlanRow | null> {
  const result = await admin.from("plans").select("*").eq("code", code).eq("is_active", true).maybeSingle();
  return unwrapMaybe("getPlanByCode", result);
}

export async function getPlanById(admin: SupabaseAdminClient, id: string): Promise<PlanRow | null> {
  const result = await admin.from("plans").select("*").eq("id", id).maybeSingle();
  return unwrapMaybe("getPlanById", result);
}

export async function findSubscriptionByProviderRef(
  admin: SupabaseAdminClient,
  provider: BillingProvider,
  providerSubscriptionId: string,
): Promise<SubscriptionRow | null> {
  const result = await admin
    .from("subscriptions")
    .select("*")
    .eq("provider", provider)
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle();
  return unwrapMaybe("findSubscriptionByProviderRef", result);
}

export async function getLatestSubscriptionForUser(
  admin: SupabaseAdminClient,
  userId: string,
): Promise<SubscriptionRow | null> {
  const result = await admin
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return unwrapMaybe("getLatestSubscriptionForUser", result);
}

/**
 * Create the row that represents a checkout in progress. `providerSubscriptionId`
 * is a real subscription id only for Paddle's flow (its transaction id
 * becomes the correlation key until `subscription.created` arrives and
 * `upsertSubscriptionFromEvent` takes over); for iyzico it is the
 * short-lived `checkoutFormToken`, swapped for the real
 * `subscriptionReferenceCode` by `updateSubscriptionProviderRef` once
 * `POST /api/billing/iyzico/callback` retrieves the completed form.
 */
export async function createPendingSubscription(
  admin: SupabaseAdminClient,
  args: {
    userId: string;
    planId: string;
    provider: BillingProvider;
    providerSubscriptionId: string;
    status: SubscriptionStatus;
    currentPeriodEnd: string | null;
    /** Set only when this row is created FROM a webhook event (Paddle's first `subscription.*` event, `applyBillingEvent`) — leaves `last_event_at` null for `startCheckout`'s iyzico placeholder, which precedes any webhook. */
    lastEventAt?: string | null;
  },
): Promise<SubscriptionRow> {
  const result = await admin
    .from("subscriptions")
    .insert({
      user_id: args.userId,
      plan_id: args.planId,
      provider: args.provider,
      provider_subscription_id: args.providerSubscriptionId,
      status: args.status,
      current_period_end: args.currentPeriodEnd,
      last_event_at: args.lastEventAt ?? null,
    })
    .select("*")
    .single();
  if (result.error) {
    throw new DatabaseError("createPendingSubscription", result.error);
  }
  return result.data;
}

/** Swap a placeholder correlation id (iyzico's `checkoutFormToken`) for the real `subscriptionReferenceCode`, and record whatever state iyzico reported at that moment. */
export async function updateSubscriptionProviderRef(
  admin: SupabaseAdminClient,
  id: string,
  args: { providerSubscriptionId: string; status: SubscriptionStatus; currentPeriodEnd: string | null },
): Promise<void> {
  const result = await admin
    .from("subscriptions")
    .update({
      provider_subscription_id: args.providerSubscriptionId,
      status: args.status,
      current_period_end: args.currentPeriodEnd,
    })
    .eq("id", id);
  if (result.error) {
    throw new DatabaseError("updateSubscriptionProviderRef", result.error);
  }
}

export async function markCancelAtPeriodEnd(
  admin: SupabaseAdminClient,
  provider: BillingProvider,
  providerSubscriptionId: string,
): Promise<void> {
  const result = await admin
    .from("subscriptions")
    .update({ cancel_at_period_end: true })
    .eq("provider", provider)
    .eq("provider_subscription_id", providerSubscriptionId);
  if (result.error) {
    throw new DatabaseError("markCancelAtPeriodEnd", result.error);
  }
}

/** Undo `markCancelAtPeriodEnd` after a real, confirmed `resume()` at the provider — never called speculatively. */
export async function clearCancelAtPeriodEnd(
  admin: SupabaseAdminClient,
  provider: BillingProvider,
  providerSubscriptionId: string,
): Promise<void> {
  const result = await admin
    .from("subscriptions")
    .update({ cancel_at_period_end: false })
    .eq("provider", provider)
    .eq("provider_subscription_id", providerSubscriptionId);
  if (result.error) {
    throw new DatabaseError("clearCancelAtPeriodEnd", result.error);
  }
}

/**
 * Idempotently record one webhook event and, if it carries subscription
 * state, apply it in event order. Returns `{ duplicate: true }` without
 * touching `subscriptions` when `(provider, eventId)` has already been
 * FULLY processed — both providers retry a webhook until they see 2xx, and
 * a retry must be a no-op, never a second state application.
 *
 * Two failure shapes review3 finding 7 named, both fixed here:
 *  - The insert-then-update was not transactional: if the `subscriptions`
 *    update below threw, the event was already recorded, so a provider
 *    retry hit the unique-violation branch and reported "duplicate"
 *    WITHOUT ever having applied the transition — permanently losing it.
 *    Fixed by checking `processed_at` on a unique-violation: null means the
 *    first attempt inserted the ledger row but never finished applying
 *    state, so this call falls through and retries the apply instead of
 *    short-circuiting.
 *  - Nothing guarded delivery order: an out-of-order retry could overwrite
 *    a newer state with a stale one. Fixed by `subscriptions.last_event_at`
 *    (migration 20260906160000) — a state update is only applied when
 *    `event.occurredAt` is strictly newer than the row's current
 *    `last_event_at` (or that column is still null).
 */
export async function applyBillingEvent(
  admin: SupabaseAdminClient,
  provider: BillingProvider,
  event: ParsedBillingEvent,
): Promise<{ duplicate: boolean }> {
  const inserted = await admin
    .from("billing_events")
    .insert({
      provider,
      event_id: event.eventId,
      type: event.type,
      payload: JSON.parse(JSON.stringify(event.raw)) as Json,
    })
    .select("id")
    .maybeSingle();

  // 23505 = unique_violation on (provider, event_id) — this exact event was
  // already inserted by a previous attempt. Only a true no-op if that
  // attempt also finished applying state (`processed_at` set); otherwise
  // fall through and retry the apply below rather than losing it.
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const existingEvent = await admin
        .from("billing_events")
        .select("processed_at")
        .eq("provider", provider)
        .eq("event_id", event.eventId)
        .maybeSingle();
      if (existingEvent.error) {
        throw new DatabaseError("applyBillingEvent:reread", existingEvent.error);
      }
      if (existingEvent.data?.processed_at) {
        return { duplicate: true };
      }
      // Fall through: the ledger row exists but was never marked processed
      // — a prior attempt's state-transition step failed or the process
      // died before reaching it.
    } else {
      throw new DatabaseError("applyBillingEvent", inserted.error);
    }
  }

  if (event.providerSubscriptionId && event.status) {
    const existing = await findSubscriptionByProviderRef(admin, provider, event.providerSubscriptionId);
    if (existing) {
      if (existing.last_event_at && event.occurredAt <= existing.last_event_at) {
        // Strictly older than (or equal to, for a duplicate delivered under
        // a different retry) the last event actually applied — recorded in
        // billing_events above, but must not overwrite a newer state.
        console.warn(
          `[billing] out-of-order ${provider} event ${event.eventId} (occurredAt=${event.occurredAt}) is not newer than subscription ${existing.id}'s last_event_at=${existing.last_event_at} — skipping state update`,
        );
      } else {
        const result = await admin
          .from("subscriptions")
          .update({
            status: event.status,
            current_period_end: event.currentPeriodEnd ?? existing.current_period_end,
            cancel_at_period_end: event.cancelAtPeriodEnd ?? existing.cancel_at_period_end,
            last_event_at: event.occurredAt,
          })
          .eq("id", existing.id);
        if (result.error) {
          throw new DatabaseError("applyBillingEvent:update", result.error);
        }
      }
    } else if (event.metadata) {
      // No pre-existing row — this is Paddle's normal path (`startCheckout`
      // never pre-creates one for Paddle, unlike iyzico; see this event's
      // `metadata` doc comment in `./types.ts`): the FIRST `subscription.*`
      // event both correlates (via `customData`) and creates the row, with
      // the real `subscriptionId` from the very first insert.
      await createPendingSubscription(admin, {
        userId: event.metadata.userId,
        planId: event.metadata.planId,
        provider,
        providerSubscriptionId: event.providerSubscriptionId,
        status: event.status,
        currentPeriodEnd: event.currentPeriodEnd,
        lastEventAt: event.occurredAt,
      });
    } else {
      // No matching row and no metadata to create one from — iyzico only:
      // its webhook carries no correlation data of its own, so this means a
      // webhook raced ahead of `POST /api/billing/iyzico/callback` (which
      // pre-creates the row and is the normal source of truth for iyzico).
      // See docs/BILLING.md "Known race" for the mitigation — iyzico
      // retries every 15 minutes, up to 3 times, so a later retry recovers
      // once the callback has landed.
      console.error(
        `[billing] webhook for unknown ${provider} subscription ${event.providerSubscriptionId} (event ${event.eventId}) — no matching subscriptions row yet`,
      );
    }
  }

  await admin.from("billing_events").update({ processed_at: new Date().toISOString() }).eq("provider", provider).eq("event_id", event.eventId);

  return { duplicate: false };
}
