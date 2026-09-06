import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ProductHealthMetrics, RangeSwitcher } from "@/components/analytics";
import { PageHeader } from "@/components/layout";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { routes } from "@/config/routes";
import { BRAND } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { parseAnalyticsRangeDays } from "@/lib/analytics/range";
import { getProductHealth, isModeratorForAnalytics } from "@/lib/db/analytics";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AnalyticsRangeDays } from "@/types/domain";

export async function generateMetadata() {
  const t = await getTranslations("AnalyticsHealthPage");
  return { title: t("metaTitle", { brand: BRAND }) };
}

interface HealthPageProps {
  searchParams: Promise<{ days?: string }>;
}

/**
 * `/analytics/health` (spec §28, §43 Stage 13): platform-wide activation,
 * retention, collaboration-depth, discovery and content-velocity signals.
 * Moderators only — everyone else gets a 404, matching
 * `src/app/(app)/moderation/page.tsx`'s own reasoning: `product_health`
 * (migration `20260903140500_creator_analytics.sql`) re-checks
 * `is_moderator()` itself, so this `notFound()` is UX, not the boundary.
 */
export default async function AnalyticsHealthPage({ searchParams }: HealthPageProps) {
  await requireUser(routes.analyticsHealth());
  const t = await getTranslations("AnalyticsHealthPage");

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={t("title")} />
        <div className="px-4 pb-8 sm:px-5">
          <EmptyState title={t("backendNotConfiguredTitle")} description={t("backendNotConfiguredDescription")} />
        </div>
      </>
    );
  }

  const supabase = await createServerSupabaseClient();
  if (!(await isModeratorForAnalytics(supabase))) {
    notFound();
  }

  const raw = await searchParams;
  const days = parseAnalyticsRangeDays(raw.days);

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={<RangeSwitcher current={days} section="health" />}
      />
      <div className="px-4 pb-8 sm:px-5">
        <Suspense fallback={<HealthSkeleton loadingLabel={t("loadingSr")} />}>
          <HealthContent days={days} />
        </Suspense>
      </div>
    </>
  );
}

async function HealthContent({ days }: { days: AnalyticsRangeDays }) {
  const supabase = await createServerSupabaseClient();
  const t = await getTranslations("AnalyticsHealthPage");

  let health: Awaited<ReturnType<typeof getProductHealth>> | null = null;
  try {
    health = await getProductHealth(supabase, days);
  } catch {
    health = null;
  }

  if (!health) {
    return (
      <ErrorState description={t("loadErrorDescription")} />
    );
  }

  return <ProductHealthMetrics health={health} />;
}

function HealthSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <span className="sr-only">{loadingLabel}</span>
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
          <Skeleton width="70%" />
          <Skeleton shape="block" height="1.75rem" />
          <Skeleton width="90%" />
        </div>
      ))}
    </div>
  );
}
