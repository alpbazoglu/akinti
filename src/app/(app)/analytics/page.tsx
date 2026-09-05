import { Suspense } from "react";
import Link from "next/link";

import {
  AnalyticsSkeleton,
  AnalyticsTimeseriesChart,
  RangeSwitcher,
  WavePerformanceTable,
} from "@/components/analytics";
import { PageHeader } from "@/components/layout";
import { EmptyState, ErrorState } from "@/components/ui";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { fillAnalyticsTimeseriesGaps } from "@/lib/analytics/timeseries";
import { formatAvgListenTime, formatPercent } from "@/lib/analytics/format";
import { parseAnalyticsRangeDays } from "@/lib/analytics/range";
import { getCreatorOverview, getCreatorTimeseries, getCreatorWavePerformance } from "@/lib/db/analytics";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatCount } from "@/lib/ui";
import type { AnalyticsRangeDays } from "@/types/domain";

export const metadata = { title: `Analytics · ${TERMS.brand}` };

interface AnalyticsPageProps {
  searchParams: Promise<{ days?: string }>;
}

/**
 * `/analytics` (spec §27, §43 Stage 13): the creator's own Play/Replay/Save/
 * Share/Comment/Duet totals, a daily chart and per-Wave performance.
 * Creator-only in the sense that it always shows the signed-in caller's own
 * numbers — `creator_overview`/`creator_timeseries`/`creator_wave_performance`
 * (migration `20260903140500_creator_analytics.sql`) resolve `auth.uid()`
 * themselves, there is no other creator's data reachable through this page.
 * Anonymous visitors are redirected to `/login` by `requireUser` (also
 * enforced by `src/proxy.ts`, since `/analytics` is not in
 * `PUBLIC_ROUTE_PREFIXES`/`PUBLIC_EXACT_ROUTES`).
 */
export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  await requireUser(routes.analytics());

  const raw = await searchParams;
  const days = parseAnalyticsRangeDays(raw.days);

  return (
    <>
      <PageHeader title="Analytics" below={<RangeSwitcher current={days} section="creator" />} />
      {isSupabaseConfigured() ? (
        <Suspense fallback={<AnalyticsSkeleton />}>
          <AnalyticsContent days={days} />
        </Suspense>
      ) : (
        <div className="px-4 pb-8 sm:px-5">
          <EmptyState
            title="Backend not configured"
            description="Analytics are unavailable in this environment."
          />
        </div>
      )}
    </>
  );
}

async function AnalyticsContent({ days }: { days: AnalyticsRangeDays }) {
  const supabase = await createServerSupabaseClient();

  let loaded: {
    overview: Awaited<ReturnType<typeof getCreatorOverview>>;
    timeseries: Awaited<ReturnType<typeof getCreatorTimeseries>>;
    waves: Awaited<ReturnType<typeof getCreatorWavePerformance>>;
  } | null = null;
  try {
    const [overview, timeseries, waves] = await Promise.all([
      getCreatorOverview(supabase, days),
      getCreatorTimeseries(supabase, days),
      getCreatorWavePerformance(supabase, days, 50),
    ]);
    loaded = { overview, timeseries, waves };
  } catch {
    loaded = null;
  }

  if (!loaded) {
    return (
      <div className="px-4 pb-8 sm:px-5">
        <ErrorState description="We could not load your analytics right now. Check your connection and try again." />
      </div>
    );
  }

  const { overview, timeseries, waves } = loaded;

  if (waves.length === 0) {
    return (
      <div className="px-4 pb-8 sm:px-5">
        <EmptyState
          title={`No ${TERMS.waves} yet`}
          description={`Publish your first ${TERMS.wave} to start seeing Plays, listeners and more here.`}
          action={
            <Link
              href={routes.create()}
              className="akinti-press inline-flex h-11 items-center rounded-key bg-ink px-5 type-subhead text-on-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Record your first {TERMS.wave}
            </Link>
          }
        />
      </div>
    );
  }

  const filledDays = fillAnalyticsTimeseriesGaps(timeseries, days);

  // The 4 figures (SCREENS.md §12): mono values in a row, only the ones
  // that are actually non-zero (§12.6 — six zeros is a debug dump).
  const figures: { label: string; value: string }[] = [
    { label: TERMS.replays.toLowerCase(), value: formatCount(overview.replays) },
    { label: TERMS.saves.toLowerCase(), value: formatCount(overview.saves) },
    { label: TERMS.shares.toLowerCase(), value: formatCount(overview.shares) },
    { label: TERMS.duets.toLowerCase(), value: formatCount(overview.duets) },
  ].filter((figure) => figure.value !== "0");

  return (
    <div className="flex flex-col gap-6 px-4 pb-8 sm:px-5">
      <div>
        <p className="type-mono-display tabular-nums text-ink">{formatCount(overview.plays)}</p>
        <p className="type-body-sm text-ink-muted">{TERMS.plays.toLowerCase()}</p>
      </div>

      <AnalyticsTimeseriesChart days={filledDays} />

      {figures.length > 0 ? (
        <>
          <div className="border-t border-hairline" />
          <div className="flex gap-8">
            {figures.map((figure) => (
              <div key={figure.label} className="flex flex-col gap-1">
                <span className="type-mono-lg tabular-nums text-ink">{figure.value}</span>
                <span className="type-caption text-ink-subtle">{figure.label}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div className="border-t border-hairline" />

      <div className="flex flex-col gap-2 text-ink-muted">
        <p className="type-caption font-medium">Unique listeners</p>
        <p className="type-mono tabular-nums text-ink">{formatCount(overview.uniqueListeners)}</p>
      </div>
      <div className="flex gap-8 text-ink-muted">
        <div className="flex flex-col gap-1">
          <span className="type-mono tabular-nums text-ink">{formatAvgListenTime(overview.avgListenSeconds)}</span>
          <span className="type-caption">avg. listen time</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="type-mono tabular-nums text-ink">{formatPercent(overview.completionRate)}</span>
          <span className="type-caption">completion rate</span>
        </div>
      </div>

      <div>
        <h2 className="type-caption mb-2 font-semibold text-ink-muted">{TERMS.wave} performance</h2>
        <WavePerformanceTable waves={waves} />
      </div>
    </div>
  );
}
