import { getTranslations } from "next-intl/server";

import { RouteLoading, Skeleton, SkeletonCardGrid, SkeletonPageHeader, SkeletonWaveList } from "@/components/ui";

/**
 * Covers `/analytics` and `/analytics/health`: KPI tiles, the chart, then the
 * per-Wave breakdown — matched to the desktop KPI-tile-row + chart-card
 * layout `analytics/page.tsx` renders at `lg` (mobile keeps the plain
 * `SkeletonCardGrid` shape it already had).
 */
export default async function AnalyticsLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <SkeletonCardGrid count={4} className="sm:grid-cols-2 lg:grid-cols-4" />
      <div className="akinti-page">
        <Skeleton shape="block" height="10rem" className="lg:h-48 lg:rounded-card" />
      </div>
      <SkeletonWaveList count={3} />
    </RouteLoading>
  );
}
