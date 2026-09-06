import { getTranslations } from "next-intl/server";

import { RouteLoading, SkeletonPageHeader, SkeletonWaveList } from "@/components/ui";

/** Covers `/hashtag/[tag]`. */
export default async function HashtagLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <SkeletonWaveList count={4} />
    </RouteLoading>
  );
}
