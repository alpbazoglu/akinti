import { getTranslations } from "next-intl/server";

import { RouteLoading, Skeleton, SkeletonPageHeader, SkeletonWaveList } from "@/components/ui";

export default async function SearchLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <div className="akinti-page mb-4">
        <Skeleton shape="block" height="2.75rem" />
      </div>
      <SkeletonWaveList count={4} />
    </RouteLoading>
  );
}
