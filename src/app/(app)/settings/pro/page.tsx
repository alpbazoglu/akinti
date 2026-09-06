import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout";
import { ProScreen } from "@/components/pro/ProScreen";
import type { ProPlanSummary } from "@/components/pro/pricing";
import { BRAND } from "@/config/terminology";
import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";
import { isIyzicoConfigured } from "@/lib/billing";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";

import { getProStatus } from "./actions";

export async function generateMetadata() {
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("ProSettingsPage");
  return { title: tPage("metaTitle", { brand: BRAND, settings: t("settings") }) };
}

/**
 * Settings -> AKINTI Pro (Wave F, PRODUCT_V2 §4/§5, `docs/BILLING.md`). The
 * action layer (`./actions.ts`) is owned by the billing wave; this route and
 * everything under `src/components/pro/` is the experience layer built on
 * top of it.
 */
export default async function ProSettingsPage() {
  const t = await getTranslations("ProSettingsPage");

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={t("title", { brand: BRAND })} />
        <EmptyState
          title={t("backendNotConfiguredTitle")}
          description={t("backendNotConfiguredDescription", { brand: BRAND })}
        />
      </>
    );
  }

  await requireUser(routes.settingsPro());

  const db = await createServerSupabaseClient();
  const [statusResult, plansResult, locale] = await Promise.all([
    getProStatus(),
    // `plans` is a public catalog (RLS `plans_select`, `is_active`) — the
    // caller's own client is enough, no admin client needed for this read.
    db.from("plans").select("code, amount, currency, interval").eq("is_active", true),
    // Resolved once here and threaded down to `StartProControls`
    // (review3 finding 27) rather than re-derived from `navigator.language`
    // on the client, which ignored the signed-in profile's own locale.
    getLocale(),
  ]);

  if (!statusResult.ok || !statusResult.data) {
    return (
      <>
        <PageHeader title={t("title", { brand: BRAND })} />
        <div className="akinti-page pb-8">
          <p className="type-body text-ink">{statusResult.formError ?? t("statusErrorDefault", { brand: BRAND })}</p>
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
  // QA `full2` defect #2: the TRY/iyzico path had no equivalent to the USD/
  // Paddle `paddleReady` gate above — checked here, before the buyer-details
  // Sheet ever opens, alongside whether a TRY plan is actually seeded.
  const iyzicoReady = isIyzicoConfigured();

  return (
    <>
      <PageHeader title={t("title", { brand: BRAND })} />
      <div className="akinti-page pb-12">
        <ProScreen
          initialStatus={statusResult.data}
          plans={plans}
          paddleClientToken={paddleClientToken}
          paddleEnvironment={paddleEnvironment}
          iyzicoReady={iyzicoReady}
          locale={locale}
        />
      </div>
    </>
  );
}
