import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import {
  AnalyticsSkeleton,
  AnalyticsTimeseriesChart,
  RangeSwitcher,
  WavePerformanceTable,
} from "@/components/analytics";
import { PageHeader } from "@/components/layout";
import { EmptyState, ErrorState } from "@/components/ui";
import { Bookmark, Clock, Handshake, Play, Repeat, Share2, SealCheck, Users } from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { BRAND } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { fillAnalyticsTimeseriesGaps } from "@/lib/analytics/timeseries";
import { formatAvgListenTime, formatPercent } from "@/lib/analytics/format";
import { parseAnalyticsRangeDays } from "@/lib/analytics/range";
import { getCreatorOverview, getCreatorTimeseries, getCreatorWavePerformance } from "@/lib/db/analytics";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatCount } from "@/lib/ui";
import type { AnalyticsRangeDays } from "@/types/domain";

export async function generateMetadata() {
  const t = await getTranslations("AnalyticsPage");
  return { title: t("metaTitle", { brand: BRAND }) };
}

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
  const t = await getTranslations("AnalyticsPage");
  const tSkeleton = await getTranslations("AnalyticsSkeleton");

  const raw = await searchParams;
  const days = parseAnalyticsRangeDays(raw.days);

  return (
    <>
      <PageHeader title={t("title")} below={<RangeSwitcher current={days} section="creator" />} />
      {isSupabaseConfigured() ? (
        <Suspense fallback={<AnalyticsSkeleton loadingLabel={tSkeleton("loadingSr")} />}>
          <AnalyticsContent days={days} />
        </Suspense>
      ) : (
        <div className="px-4 pb-8 sm:px-5">
          <EmptyState
            title={t("backendNotConfiguredTitle")}
            description={t("backendNotConfiguredDescription")}
          />
        </div>
      )}
    </>
  );
}

async function AnalyticsContent({ days }: { days: AnalyticsRangeDays }) {
  const supabase = await createServerSupabaseClient();
  const t = await getTranslations("AnalyticsPage");
  const tTerms = await getTranslations("Terms");

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
        <ErrorState description={t("loadErrorDescription")} />
      </div>
    );
  }

  const { overview, timeseries, waves } = loaded;

  if (waves.length === 0) {
    return (
      <div className="px-4 pb-8 sm:px-5">
        <EmptyState
          title={t("emptyTitle", { waves: tTerms("waves") })}
          description={t("emptyDescription", { wave: tTerms("wave") })}
          action={
            <Link
              href={routes.create()}
              className="akinti-press inline-flex h-11 items-center rounded-key bg-ink px-5 type-subhead text-on-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {t("recordFirst", { wave: tTerms("wave") })}
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
    { label: tTerms("replays"), value: formatCount(overview.replays) },
    { label: tTerms("saves"), value: formatCount(overview.saves) },
    { label: tTerms("shares"), value: formatCount(overview.shares) },
    { label: tTerms("duets"), value: formatCount(overview.duets) },
  ].filter((figure) => figure.value !== "0");

  // Desktop KPI tiles (this pass's brief: "KPI tiles row — only non-zero,
  // icons"). Same non-zero rule as `figures` above, just every number the
  // mobile layout already prints, reshaped into cards for the wider canvas
  // rather than a second data source.
  const kpiTiles = [
    { key: "plays", raw: overview.plays, label: tTerms("plays"), value: formatCount(overview.plays), icon: Play },
    { key: "uniqueListeners", raw: overview.uniqueListeners, label: t("uniqueListeners"), value: formatCount(overview.uniqueListeners), icon: Users },
    { key: "replays", raw: overview.replays, label: tTerms("replays"), value: formatCount(overview.replays), icon: Repeat },
    { key: "saves", raw: overview.saves, label: tTerms("saves"), value: formatCount(overview.saves), icon: Bookmark },
    { key: "shares", raw: overview.shares, label: tTerms("shares"), value: formatCount(overview.shares), icon: Share2 },
    { key: "duets", raw: overview.duets, label: tTerms("duets"), value: formatCount(overview.duets), icon: Handshake },
    { key: "avgListen", raw: overview.avgListenSeconds ?? 0, label: t("avgListenTime"), value: formatAvgListenTime(overview.avgListenSeconds), icon: Clock },
    { key: "completion", raw: overview.completionRate, label: t("completionRate"), value: formatPercent(overview.completionRate), icon: SealCheck },
  ].filter((tile) => tile.raw > 0);

  return (
    <div className="flex flex-col gap-6 px-4 pb-8 sm:px-5">
      {kpiTiles.length > 0 ? (
        <div className="hidden gap-3 lg:grid lg:grid-cols-4">
          {kpiTiles.map(({ key, label, value, icon: Icon }) => (
            <div key={key} className="flex flex-col gap-2 rounded-card border border-hairline bg-elevation-2 p-4">
              <Icon className="size-5 text-ink-subtle" aria-hidden="true" />
              <span className="type-mono-lg tabular-nums text-ink">{value}</span>
              <span className="type-caption text-ink-subtle">{label}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="lg:hidden">
        <p className="type-mono-display tabular-nums text-ink">{formatCount(overview.plays)}</p>
        <p className="type-body-sm text-ink-muted">{tTerms("plays")}</p>
      </div>

      <AnalyticsTimeseriesChart days={filledDays} />

      {figures.length > 0 ? (
        <div className="lg:hidden">
          <div className="border-t border-hairline" />
          <div className="flex gap-8 pt-6">
            {figures.map((figure) => (
              <div key={figure.label} className="flex flex-col gap-1">
                <span className="type-mono-lg tabular-nums text-ink">{figure.value}</span>
                <span className="type-caption text-ink-subtle">{figure.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="lg:hidden">
        <div className="border-t border-hairline" />
        <div className="flex flex-col gap-2 pt-6 text-ink-muted">
          <p className="type-caption font-medium">{t("uniqueListeners")}</p>
          <p className="type-mono tabular-nums text-ink">{formatCount(overview.uniqueListeners)}</p>
        </div>
        <div className="flex gap-8 pt-4 text-ink-muted">
          <div className="flex flex-col gap-1">
            <span className="type-mono tabular-nums text-ink">{formatAvgListenTime(overview.avgListenSeconds)}</span>
            <span className="type-caption">{t("avgListenTime")}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="type-mono tabular-nums text-ink">{formatPercent(overview.completionRate)}</span>
            <span className="type-caption">{t("completionRate")}</span>
          </div>
        </div>
      </div>

      <div>
        <h2 className="type-caption mb-2 font-semibold text-ink-muted">{t("wavePerformance", { wave: tTerms("wave") })}</h2>
        <WavePerformanceTable waves={waves} />
      </div>
    </div>
  );
}
