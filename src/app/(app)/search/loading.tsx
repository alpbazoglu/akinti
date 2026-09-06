import { getTranslations } from "next-intl/server";

import { RouteLoading, Skeleton, SkeletonCardGrid, SkeletonPageHeader, SkeletonWaveList } from "@/components/ui";

/** Mobile keeps its stacked-sections shape; desktop adds a tab-row placeholder above the card grid `SearchView` renders at `lg`. */
export default async function SearchLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <div className="akinti-page mb-4 max-w-xl">
        <Skeleton shape="block" height="2.75rem" />
      </div>
      <div className="lg:hidden">
        <SkeletonWaveList count={4} />
      </div>
      <div className="hidden lg:block">
        <div className="akinti-page mb-4 flex gap-5">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} shape="line" width="4rem" className="h-6" />
          ))}
        </div>
        <SkeletonCardGrid count={4} className="lg:grid-cols-2 xl:grid-cols-4" />
      </div>
    </RouteLoading>
  );
}
