import { Suspense } from "react";
import { notFound } from "next/navigation";

import { ProductHealthMetrics, RangeSwitcher } from "@/components/analytics";
import { PageHeader } from "@/components/layout";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { parseAnalyticsRangeDays } from "@/lib/analytics/range";
import { getProductHealth, isModeratorForAnalytics } from "@/lib/db/analytics";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AnalyticsRangeDays } from "@/types/domain";

export const metadata = { title: `Product health · ${TERMS.brand}` };

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

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title="Product health" />
        <div className="px-4 pb-8 sm:px-5">
          <EmptyState title="Backend not configured" description="Product health is unavailable in this environment." />
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
        title="Product health"
        description="Platform-wide activation, retention and discovery signals (spec §28) — separate from creator analytics."
        actions={<RangeSwitcher current={days} section="health" />}
      />
      <div className="px-4 pb-8 sm:px-5">
        <Suspense fallback={<HealthSkeleton />}>
          <HealthContent days={days} />
        </Suspense>
      </div>
    </>
  );
}

async function HealthContent({ days }: { days: AnalyticsRangeDays }) {
  const supabase = await createServerSupabaseClient();

  let health: Awaited<ReturnType<typeof getProductHealth>> | null = null;
  try {
    health = await getProductHealth(supabase, days);
  } catch {
    health = null;
  }

  if (!health) {
    return (
      <ErrorState description="We could not load product health right now. Check your connection and try again." />
    );
  }

  return <ProductHealthMetrics health={health} />;
}

function HealthSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <span className="sr-only">Loading product health…</span>
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
