import { Suspense } from "react";
import Link from "next/link";

import {
  AnalyticsSkeleton,
  AnalyticsTimeseriesChart,
  RangeSwitcher,
  StatTile,
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
      <PageHeader
        title="Analytics"
        description="Your Plays, listeners and Wave performance. No Likes — ever."
        actions={<RangeSwitcher current={days} section="creator" />}
      />
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
              className="inline-flex h-10 items-center justify-center rounded-full bg-accent px-4 text-sm font-medium text-fg-on-accent shadow-xs transition-colors hover:bg-accent-hover"
            >
              Create a {TERMS.wave}
            </Link>
          }
        />
      </div>
    );
  }

  const filledDays = fillAnalyticsTimeseriesGaps(timeseries, days);
  const followerDeltaLabel = `${overview.followerDelta >= 0 ? "+" : ""}${formatCount(overview.followerDelta)}`;

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 sm:px-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label={TERMS.plays}
          value={formatCount(overview.plays)}
          kind="meaningful"
          hint="Counted once per listener, not every playback ping."
        />
        <StatTile
          label="Unique listeners"
          value={formatCount(overview.uniqueListeners)}
          kind="meaningful"
        />
        <StatTile
          label={TERMS.replays}
          value={formatCount(overview.replays)}
          kind="meaningful"
          hint="One per listener at most — not total repeat plays."
        />
        <StatTile label={TERMS.saves} value={formatCount(overview.saves)} kind="meaningful" />
        <StatTile label={TERMS.shares} value={formatCount(overview.shares)} kind="meaningful" />
        <StatTile label={TERMS.comments} value={formatCount(overview.comments)} kind="meaningful" />
        <StatTile label={TERMS.duets} value={formatCount(overview.duets)} kind="meaningful" />
        <StatTile
          label="Avg. listen time"
          value={formatAvgListenTime(overview.avgListenSeconds)}
          kind="raw"
          hint="Average across listens that counted as a play."
        />
        <StatTile
          label="Completion rate"
          value={formatPercent(overview.completionRate)}
          kind="raw"
          hint="Share of counted listens that reached 90% of the Wave."
        />
        <StatTile
          label="Follower change"
          value={followerDeltaLabel}
          hint="New followers gained in this window (unfollows are not netted out)."
        />
      </div>

      <AnalyticsTimeseriesChart days={filledDays} />

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-fg">{TERMS.wave} performance</h2>
        <WavePerformanceTable waves={waves} />
      </div>
    </div>
  );
}
