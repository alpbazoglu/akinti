import { getTranslations } from "next-intl/server";

import { RouteLoading, Skeleton, SkeletonCardGrid, SkeletonPageHeader } from "@/components/ui";

/** Explore's loading state: the header search action, a horizontal creator strip, then the trending card grid (desktop v3 allows cards on this screen). */
export default async function ExploreLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader withAction />
      <div className="akinti-page mb-6 flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex w-40 shrink-0 flex-col gap-2 rounded-card border border-hairline p-3">
            <Skeleton shape="waterline" />
            <Skeleton shape="line" width="70%" />
            <Skeleton shape="line" width="45%" className="h-2.5 opacity-70" />
          </div>
        ))}
      </div>
      <SkeletonCardGrid count={6} />
    </RouteLoading>
  );
}
