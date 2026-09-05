/**
 * Seeds the `plans` catalog for AKINTI Pro (Wave F, `docs/BILLING.md`
 * "Seeding plans"). Migration `20260906100000_subscriptions.sql` creates
 * `plans` empty on purpose: inserting a fabricated `provider_price_id` would
 * let a checkout silently reference a price that doesn't exist at the
 * provider, which is exactly the "fake success" spec §44 rule 9 forbids.
 * This script never invents an id — it only ever reads one from the
 * environment, already created by hand in each provider's dashboard first
 * (iyzico Merchant Panel → Subscription → Products & Pricing Plans; Paddle →
 * Catalog → Prices).
 *
 * Four plan codes, one price id env var each:
 *
 *   pro_monthly_try  <- IYZICO_PLAN_MONTHLY_TRY
 *   pro_yearly_try   <- IYZICO_PLAN_YEARLY_TRY  (+ IYZICO_PLAN_YEARLY_TRY_AMOUNT)
 *   pro_monthly_usd  <- PADDLE_PRICE_MONTHLY_USD
 *   pro_yearly_usd   <- PADDLE_PRICE_YEARLY_USD (+ PADDLE_PRICE_YEARLY_USD_AMOUNT)
 *
 * Any plan whose price-id env var is unset is skipped with a clear message —
 * never inserted with a placeholder. The two monthly amounts are the
 * founder's already-decided prices (PRODUCT_V2 §5/§6: ₺79.99/month TR,
 * $4.99/month international), so they are real numbers, not placeholders,
 * and are filled in here directly. The two yearly amounts are NOT decided —
 * `docs/BILLING.md` is explicit that "12 months minus a discount" is not a
 * fixed number until the founder picks the actual annual-discount rate — so
 * a yearly plan additionally requires its own `*_AMOUNT` env var (integer
 * minor units: kuruş for TRY, cents for USD) and is skipped, not
 * defaulted to a guessed discount, when that is missing too.
 *
 * Run with: `npx tsx --env-file-if-exists=.env.local scripts/seed-plans.ts`
 * (idempotent — re-running skips any code that already has a `plans` row).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createAdminClient } from "@/lib/supabase/admin";
import type { BillingProvider, PlanCode, PlanInterval } from "@/types/database";

/* ------------------------------------------------------------------------ */
/* .env.local loader (same approach as scripts/worker.ts)                   */
/* ------------------------------------------------------------------------ */

function loadEnvFile(): void {
  for (const name of [".env.local", ".env"]) {
    const filePath = path.resolve(process.cwd(), name);
    if (!existsSync(filePath)) continue;
    const contents = readFileSync(filePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

/* ------------------------------------------------------------------------ */
/* Plan catalog                                                             */
/* ------------------------------------------------------------------------ */

/** Minor units (kuruş/cents) — PRODUCT_V2 §5/§6's already-decided monthly prices, not placeholders. */
const MONTHLY_TRY_AMOUNT = 7999;
const MONTHLY_USD_AMOUNT = 499;

interface PlanSeed {
  code: PlanCode;
  provider: BillingProvider;
  currency: "TRY" | "USD";
  interval: PlanInterval;
  /** Env var naming the real provider price/pricing-plan reference id. Required. */
  priceIdEnvVar: string;
  /**
   * Env var naming the real minor-unit amount for this plan. `null` means
   * the amount is already decided (a monthly plan) and filled in directly;
   * a yearly plan names its own `*_AMOUNT` var because the discount is not
   * decided yet (see module doc comment).
   */
  amountEnvVar: string | null;
  decidedAmount: number | null;
}

const PLAN_SEEDS: readonly PlanSeed[] = [
  {
    code: "pro_monthly_try",
    provider: "iyzico",
    currency: "TRY",
    interval: "month",
    priceIdEnvVar: "IYZICO_PLAN_MONTHLY_TRY",
    amountEnvVar: null,
    decidedAmount: MONTHLY_TRY_AMOUNT,
  },
  {
    code: "pro_yearly_try",
    provider: "iyzico",
    currency: "TRY",
    interval: "year",
    priceIdEnvVar: "IYZICO_PLAN_YEARLY_TRY",
    amountEnvVar: "IYZICO_PLAN_YEARLY_TRY_AMOUNT",
    decidedAmount: null,
  },
  {
    code: "pro_monthly_usd",
    provider: "paddle",
    currency: "USD",
    interval: "month",
    priceIdEnvVar: "PADDLE_PRICE_MONTHLY_USD",
    amountEnvVar: null,
    decidedAmount: MONTHLY_USD_AMOUNT,
  },
  {
    code: "pro_yearly_usd",
    provider: "paddle",
    currency: "USD",
    interval: "year",
    priceIdEnvVar: "PADDLE_PRICE_YEARLY_USD",
    amountEnvVar: "PADDLE_PRICE_YEARLY_USD_AMOUNT",
    decidedAmount: null,
  },
];

/* ------------------------------------------------------------------------ */
/* Main                                                                      */
/* ------------------------------------------------------------------------ */

async function main(): Promise<void> {
  loadEnvFile();
  const admin = createAdminClient();

  let seeded = 0;
  let skipped = 0;

  for (const seed of PLAN_SEEDS) {
    const priceId = process.env[seed.priceIdEnvVar]?.trim();
    if (!priceId) {
      console.warn(
        `[seed] skipping "${seed.code}" — ${seed.priceIdEnvVar} is not set. ` +
          `Create the real price in ${seed.provider === "iyzico" ? "the iyzico Merchant Panel" : "Paddle → Catalog → Prices"} first, then set it.`,
      );
      skipped += 1;
      continue;
    }

    let amount = seed.decidedAmount;
    if (amount === null) {
      const raw = seed.amountEnvVar ? process.env[seed.amountEnvVar]?.trim() : undefined;
      const parsed = raw ? Number.parseInt(raw, 10) : NaN;
      if (!raw || !Number.isFinite(parsed) || parsed <= 0) {
        console.warn(
          `[seed] skipping "${seed.code}" — ${seed.priceIdEnvVar} is set, but its real minor-unit amount is not ` +
            `(${seed.amountEnvVar} is unset). The annual discount is not decided yet (docs/BILLING.md "Seeding ` +
            `plans") — set ${seed.amountEnvVar} once the founder picks the real yearly price, never a guess.`,
        );
        skipped += 1;
        continue;
      }
      amount = parsed;
    }

    const { data: existing } = await admin.from("plans").select("id").eq("code", seed.code).maybeSingle();
    if (existing) {
      console.log(`[seed] already seeded: "${seed.code}" (${existing.id}) — skipping`);
      skipped += 1;
      continue;
    }

    const { data: inserted, error } = await admin
      .from("plans")
      .insert({
        code: seed.code,
        provider: seed.provider,
        provider_price_id: priceId,
        amount,
        currency: seed.currency,
        interval: seed.interval,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      throw new Error(`plans insert failed for "${seed.code}": ${error?.message ?? "no row returned"}`);
    }

    console.log(`[seed] seeded "${seed.code}" — ${inserted.id}, ${amount} ${seed.currency} minor units / ${seed.interval}`);
    seeded += 1;
  }

  console.log(`[seed] done — ${seeded} seeded, ${skipped} skipped, ${PLAN_SEEDS.length} total.`);
}

main().catch((err) => {
  console.error("[seed] fatal error:", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
