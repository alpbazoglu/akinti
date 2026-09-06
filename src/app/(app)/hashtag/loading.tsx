import { getTranslations } from "next-intl/server";

import { RouteLoading, SkeletonCardGrid, SkeletonPageHeader, SkeletonWaveList } from "@/components/ui";

/** Covers `/hashtag/[tag]`. Mobile keeps its row-list shape; desktop matches the `ChallengeWaveGrid` card grid the real page now renders at `lg`. */
export default async function HashtagLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <div className="lg:hidden">
        <SkeletonWaveList count={4} />
      </div>
      <div className="hidden lg:block">
        <SkeletonCardGrid count={6} className="lg:grid-cols-2 xl:grid-cols-3" />
      </div>
    </RouteLoading>
  );
}
