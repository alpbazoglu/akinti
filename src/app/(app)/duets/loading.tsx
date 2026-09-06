import { getTranslations } from "next-intl/server";

import { RouteLoading, Skeleton, SkeletonPageHeader, SkeletonRowList } from "@/components/ui";

/** Mobile keeps its single-column row-list shape; desktop matches the two-pane list/detail `DuetRequestsView` now renders at `lg`. */
export default async function DuetsLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <div className="lg:hidden">
        <SkeletonRowList count={5} />
      </div>
      <div className="hidden gap-6 lg:grid lg:grid-cols-[320px_1fr]">
        <SkeletonRowList count={5} />
        <div className="pr-5">
          <Skeleton shape="block" height="16rem" className="rounded-card" />
        </div>
      </div>
    </RouteLoading>
  );
}
