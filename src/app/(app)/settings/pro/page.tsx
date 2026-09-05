import { PageHeader } from "@/components/layout";
import { ProScreen } from "@/components/pro/ProScreen";
import type { ProPlanSummary } from "@/components/pro/pricing";
import { TERMS } from "@/config/terminology";
import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";

import { getProStatus } from "./actions";

export const metadata = { title: `AKINTI Pro · ${TERMS.settings}` };

/**
 * Settings -> AKINTI Pro (Wave F, PRODUCT_V2 §4/§5, `docs/BILLING.md`). The
 * action layer (`./actions.ts`) is owned by the billing wave; this route and
 * everything under `src/components/pro/` is the experience layer built on
 * top of it.
 */
export default async function ProSettingsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title="AKINTI Pro" />
        <EmptyState
          title="Backend not configured"
          description="NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. AKINTI Pro is unavailable until this environment is connected to a Supabase project."
        />
      </>
    );
  }

  await requireUser(routes.settingsPro());

  const db = await createServerSupabaseClient();
  const [statusResult, plansResult] = await Promise.all([
    getProStatus(),
    // `plans` is a public catalog (RLS `plans_select`, `is_active`) — the
    // caller's own client is enough, no admin client needed for this read.
    db.from("plans").select("code, amount, currency, interval").eq("is_active", true),
  ]);

  if (!statusResult.ok || !statusResult.data) {
    return (
      <>
        <PageHeader title="AKINTI Pro" />
        <div className="akinti-page pb-8">
          <p className="type-body text-ink">{statusResult.formError ?? "We couldn't load your AKINTI Pro status. Try again."}</p>
        </div>
      </>
    );
  }

  const plans: ProPlanSummary[] = (plansResult.data ?? []).map((row) => ({
    code: row.code,
    amount: row.amount,
    currency: row.currency,
    interval: row.interval,
  }));

  const paddleClientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim() || null;
  const paddleEnvironment = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === "production" ? "production" : "sandbox";

  return (
    <>
      <PageHeader title="AKINTI Pro" />
      <div className="akinti-page pb-12">
        <ProScreen
          initialStatus={statusResult.data}
          plans={plans}
          paddleClientToken={paddleClientToken}
          paddleEnvironment={paddleEnvironment}
        />
      </div>
    </>
  );
}
