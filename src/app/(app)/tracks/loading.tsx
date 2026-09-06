import { getTranslations } from "next-intl/server";

import { RouteLoading, SkeletonCardGrid, SkeletonPageHeader } from "@/components/ui";

export default async function TracksLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <SkeletonCardGrid count={6} />
    </RouteLoading>
  );
}
