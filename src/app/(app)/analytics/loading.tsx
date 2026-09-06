import { getTranslations } from "next-intl/server";

import { RouteLoading, SkeletonCardGrid, SkeletonPageHeader, SkeletonWaveList } from "@/components/ui";

/** Covers `/analytics` and `/analytics/health`: stat tiles, then the per-Wave breakdown. */
export default async function AnalyticsLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <SkeletonCardGrid count={4} className="sm:grid-cols-2 lg:grid-cols-4" />
      <SkeletonWaveList count={3} />
    </RouteLoading>
  );
}
