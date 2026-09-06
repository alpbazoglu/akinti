import { describe, expect, it } from "vitest";

import type { SupabaseAdminClient } from "@/lib/supabase/admin";
import type { BillingProvider, SubscriptionStatus } from "@/types/database";

import { applyBillingEvent, getLatestSubscriptionForUser } from "./repository";
import type { ParsedBillingEvent } from "./types";

/**
 * Table-driven regression tests for `applyBillingEvent` (review3 finding
 * 15 — this function had zero tests despite being the money path; findings
 * 7 and 8 both lived in this untested half).
 *
 * Drives a fake admin client rather than a real Postgres connection: a
 * minimal in-memory implementation of the exact `.from().insert()
 * .select().maybeSingle()` / `.select().eq().maybeSingle()` /
 * `.update().eq()` chains `repository.ts` actually calls, including the
 * `(provider, event_id)` unique constraint `billing_events` enforces live
 * (migration `20260906100000_subscriptions.sql`) — good enough to exercise
 * the idempotency and ordering logic under test without needing a live
 * database for every CI run.
 */

/* ------------------------------------------------------------------------ */
/* Minimal fake Supabase admin client                                       */
/* ------------------------------------------------------------------------ */

interface FakeError {
  code: string;
  message: string;
}

type Row = Record<string, unknown>;

class FakeTable {
  rows: Row[] = [];
  constructor(private readonly uniqueKeys: string[][] = []) {}

  findConflict(payload: Row): Row | undefined {
    return this.rows.find((row) => this.uniqueKeys.some((keys) => keys.every((k) => row[k] === payload[k])));
  }
}

class FakeQuery implements PromiseLike<{ data: unknown; error: FakeError | null }> {
  private mode: "select" | "insert" | "update" = "select";
  private payload: Row | null = null;
  private readonly filters: [string, unknown][] = [];
  private limitN: number | null = null;
  private orderColumn: string | null = null;
  private orderAscending = true;

  constructor(private readonly table: FakeTable) {}

  insert(payload: Row): this {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Row): this {
    this.mode = "update";
    this.payload = payload;
    return this;
  }

  select(_columns?: string): this {
    void _columns;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderColumn = column;
    this.orderAscending = opts?.ascending ?? true;
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every(([column, value]) => row[column] === value);
  }

  private execute(): { data: unknown; error: FakeError | null } {
    if (this.mode === "insert") {
      const payload = this.payload!;
      const conflict = this.table.findConflict(payload);
      if (conflict) {
        return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
      }
      const row: Row = {
        id: payload.id ?? `row_${this.table.rows.length + 1}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        processed_at: null,
        last_event_at: null,
        ...payload,
      };
      this.table.rows.push(row);
      return { data: [row], error: null };
    }
    if (this.mode === "update") {
      const matched = this.table.rows.filter((row) => this.matches(row));
      for (const row of matched) Object.assign(row, this.payload);
      return { data: matched, error: null };
    }
    let rows = this.table.rows.filter((row) => this.matches(row));
    if (this.orderColumn) {
      const col = this.orderColumn;
      rows = [...rows].sort((a, b) => {
        const av = String(a[col]);
        const bv = String(b[col]);
        return this.orderAscending ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    return { data: rows, error: null };
  }

  async maybeSingle(): Promise<{ data: unknown; error: FakeError | null }> {
    const result = this.execute();
    if (result.error) return { data: null, error: result.error };
    const rows = result.data as Row[];
    return { data: rows[0] ?? null, error: null };
  }

  async single(): Promise<{ data: unknown; error: FakeError | null }> {
    return this.maybeSingle();
  }

  // Supabase's real query builder is itself thenable, and repository.ts
  // sometimes `await`s it directly with no terminal `.single()`/
  // `.maybeSingle()` call (every `update().eq()` in this module) — this
  // makes that pattern work against the fake the same way.
  then<TResult1, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: FakeError | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

function createFakeAdmin(): {
  admin: SupabaseAdminClient;
  billingEvents: FakeTable;
  subscriptions: FakeTable;
} {
  const billingEvents = new FakeTable([["provider", "event_id"]]);
  const subscriptions = new FakeTable([["provider", "provider_subscription_id"]]);

  const admin = {
    from(table: string) {
      if (table === "billing_events") return new FakeQuery(billingEvents);
      if (table === "subscriptions") return new FakeQuery(subscriptions);
      throw new Error(`fake admin client: unexpected table "${table}"`);
    },
  } as unknown as SupabaseAdminClient;

  return { admin, billingEvents, subscriptions };
}

/* ------------------------------------------------------------------------ */
/* Fixtures                                                                  */
/* ------------------------------------------------------------------------ */

const PROVIDER_REF = "sub_test_123";
const USER_ID = "11111111-1111-1111-1111-111111111111";
const PLAN_ID = "22222222-2222-2222-2222-222222222222";

function makeEvent(overrides: Partial<ParsedBillingEvent> = {}): ParsedBillingEvent {
  return {
    eventId: `evt_${Math.random().toString(36).slice(2)}`,
    type: "subscription.updated",
    providerSubscriptionId: PROVIDER_REF,
    status: "active",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: null,
    metadata: null,
    occurredAt: "2026-09-06T00:00:00.000Z",
    raw: { synthetic: true },
    ...overrides,
  };
}

async function seedSubscription(
  subscriptions: FakeTable,
  overrides: Partial<Row> = {},
): Promise<void> {
  subscriptions.rows.push({
    id: "sub_row_1",
    user_id: USER_ID,
    plan_id: PLAN_ID,
    provider: "paddle" as BillingProvider,
    provider_subscription_id: PROVIDER_REF,
    status: "trialing" as SubscriptionStatus,
    current_period_end: null,
    cancel_at_period_end: false,
    last_event_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  });
}

/* ------------------------------------------------------------------------ */
/* Table-driven state transitions                                           */
/* ------------------------------------------------------------------------ */

describe("applyBillingEvent — state transitions", () => {
  const cases: {
    name: string;
    from: SubscriptionStatus;
    event: Partial<ParsedBillingEvent>;
    expectedStatus: SubscriptionStatus;
  }[] = [
    { name: "created (trialing) stays trialing on a trialing event", from: "trialing", event: { status: "trialing" }, expectedStatus: "trialing" },
    { name: "active", from: "trialing", event: { status: "active" }, expectedStatus: "active" },
    { name: "past_due", from: "active", event: { status: "past_due" }, expectedStatus: "past_due" },
    { name: "canceled", from: "active", event: { status: "canceled", cancelAtPeriodEnd: true }, expectedStatus: "canceled" },
    { name: "resumed (cancel_at_period_end cleared on an active event)", from: "active", event: { status: "active", cancelAtPeriodEnd: false }, expectedStatus: "active" },
    { name: "expired", from: "canceled", event: { status: "expired" }, expectedStatus: "expired" },
  ];

  for (const { name, from, event, expectedStatus } of cases) {
    it(`applies: ${name}`, async () => {
      const { admin, subscriptions } = createFakeAdmin();
      await seedSubscription(subscriptions, { status: from, last_event_at: "2026-09-05T00:00:00.000Z" });

      const result = await applyBillingEvent(
        admin,
        "paddle",
        makeEvent({ ...event, occurredAt: "2026-09-06T00:00:00.000Z" }),
      );

      expect(result.duplicate).toBe(false);
      const row = subscriptions.rows[0];
      expect(row.status).toBe(expectedStatus);
      expect(row.last_event_at).toBe("2026-09-06T00:00:00.000Z");
    });
  }

  it("resumed also clears cancel_at_period_end on the row", async () => {
    const { admin, subscriptions } = createFakeAdmin();
    await seedSubscription(subscriptions, {
      status: "active",
      cancel_at_period_end: true,
      last_event_at: "2026-09-05T00:00:00.000Z",
    });

    await applyBillingEvent(
      admin,
      "paddle",
      makeEvent({ status: "active", cancelAtPeriodEnd: false, occurredAt: "2026-09-06T00:00:00.000Z" }),
    );

    expect(subscriptions.rows[0].cancel_at_period_end).toBe(false);
  });

  it("creates a new row from event.metadata when no subscription exists yet (Paddle's first event)", async () => {
    const { admin, subscriptions } = createFakeAdmin();

    const result = await applyBillingEvent(
      admin,
      "paddle",
      makeEvent({ status: "active", metadata: { userId: USER_ID, planId: PLAN_ID } }),
    );

    expect(result.duplicate).toBe(false);
    expect(subscriptions.rows).toHaveLength(1);
    expect(subscriptions.rows[0]).toMatchObject({
      user_id: USER_ID,
      plan_id: PLAN_ID,
      status: "active",
      last_event_at: "2026-09-06T00:00:00.000Z",
    });
  });

  it("does not create or update anything when neither a matching row nor metadata exists (iyzico webhook race)", async () => {
    const { admin, subscriptions } = createFakeAdmin();

    const result = await applyBillingEvent(admin, "iyzico", makeEvent({ status: "active", metadata: null }));

    expect(result.duplicate).toBe(false);
    expect(subscriptions.rows).toHaveLength(0);
  });

  it("records but does not apply an event with a null status (finding 8 — unrecognised iyzico event type)", async () => {
    const { admin, subscriptions, billingEvents } = createFakeAdmin();
    await seedSubscription(subscriptions, { status: "active", last_event_at: "2026-09-05T00:00:00.000Z" });

    const result = await applyBillingEvent(admin, "iyzico", makeEvent({ status: null }));

    expect(result.duplicate).toBe(false);
    expect(subscriptions.rows[0].status).toBe("active");
    expect(subscriptions.rows[0].last_event_at).toBe("2026-09-05T00:00:00.000Z");
    expect(billingEvents.rows).toHaveLength(1);
    expect(billingEvents.rows[0].processed_at).not.toBeNull();
  });
});

/* ------------------------------------------------------------------------ */
/* Idempotency and ordering (findings 7)                                    */
/* ------------------------------------------------------------------------ */

describe("applyBillingEvent — duplicate and out-of-order delivery", () => {
  it("duplicate: a fully-processed event id is a no-op on retry", async () => {
    const { admin, subscriptions } = createFakeAdmin();
    await seedSubscription(subscriptions, { status: "trialing", last_event_at: null });
    const event = makeEvent({ status: "active", occurredAt: "2026-09-06T00:00:00.000Z" });

    const first = await applyBillingEvent(admin, "paddle", event);
    expect(first.duplicate).toBe(false);
    expect(subscriptions.rows[0].status).toBe("active");

    // A different status on the SAME event id can only mean a retry of the
    // exact same webhook delivery (providers don't reuse event ids) — must
    // not re-apply, so the row must stay exactly as the first call left it.
    const retry = await applyBillingEvent(admin, "paddle", { ...event, status: "canceled" });
    expect(retry.duplicate).toBe(true);
    expect(subscriptions.rows[0].status).toBe("active");
  });

  it("a crash between the ledger insert and the state update is retried, not lost", async () => {
    const { admin, subscriptions, billingEvents } = createFakeAdmin();
    await seedSubscription(subscriptions, { status: "trialing", last_event_at: null });
    const event = makeEvent({ status: "active", occurredAt: "2026-09-06T00:00:00.000Z" });

    // Simulate the first attempt having inserted the ledger row and then
    // died before reaching the state update (processed_at stays null) —
    // exactly the failure review3 finding 7 named.
    billingEvents.rows.push({
      id: "evt_row_1",
      provider: "paddle",
      event_id: event.eventId,
      type: event.type,
      payload: {},
      processed_at: null,
      created_at: "2026-09-06T00:00:00.000Z",
    });

    const retry = await applyBillingEvent(admin, "paddle", event);

    expect(retry.duplicate).toBe(false);
    expect(subscriptions.rows[0].status).toBe("active");
    expect(billingEvents.rows[0].processed_at).not.toBeNull();
  });

  it("out-of-order: an older event delivered after a newer one does not overwrite the newer state", async () => {
    const { admin, subscriptions } = createFakeAdmin();
    await seedSubscription(subscriptions, { status: "trialing", last_event_at: null });

    const newer = makeEvent({ status: "active", occurredAt: "2026-09-06T12:00:00.000Z" });
    const older = makeEvent({ status: "past_due", occurredAt: "2026-09-06T06:00:00.000Z" });

    // Newer event arrives and is applied first (e.g. the older one's retry
    // was delayed by the provider).
    await applyBillingEvent(admin, "paddle", newer);
    expect(subscriptions.rows[0].status).toBe("active");

    // The older, delayed retry must not downgrade a subscription that has
    // already moved past it.
    const result = await applyBillingEvent(admin, "paddle", older);
    expect(result.duplicate).toBe(false);
    expect(subscriptions.rows[0].status).toBe("active");
    expect(subscriptions.rows[0].last_event_at).toBe("2026-09-06T12:00:00.000Z");
  });
});

describe("getLatestSubscriptionForUser", () => {
  it("returns the most recently created row for that user", async () => {
    const { admin, subscriptions } = createFakeAdmin();
    subscriptions.rows.push(
      { id: "s1", user_id: USER_ID, created_at: "2026-09-01T00:00:00.000Z", status: "canceled" },
      { id: "s2", user_id: USER_ID, created_at: "2026-09-05T00:00:00.000Z", status: "active" },
    );

    const latest = await getLatestSubscriptionForUser(admin, USER_ID);
    expect(latest?.id).toBe("s2");
  });

  it("returns null when the user has never subscribed", async () => {
    const { admin } = createFakeAdmin();
    const latest = await getLatestSubscriptionForUser(admin, USER_ID);
    expect(latest).toBeNull();
  });
});
