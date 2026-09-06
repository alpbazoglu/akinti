import { getTranslations } from "next-intl/server";

import { RouteLoading, Skeleton, SkeletonCardGrid, SkeletonPageHeader } from "@/components/ui";

/** Covers `/tracks`. Desktop's real page adds a filter-chip row above the grid (`TracksLibraryGrid`) — shaped here too, not just the cards. */
export default async function TracksLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <div className="akinti-page hidden gap-2 pb-4 lg:flex">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} shape="line" width="4.5rem" className="h-8 rounded-tag" />
        ))}
      </div>
      <SkeletonCardGrid count={6} className="lg:grid-cols-2 xl:grid-cols-3" />
    </RouteLoading>
  );
}
