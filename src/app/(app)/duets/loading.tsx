import { getTranslations } from "next-intl/server";

import { RouteLoading, SkeletonPageHeader, SkeletonRowList } from "@/components/ui";

export default async function DuetsLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <SkeletonRowList count={5} />
    </RouteLoading>
  );
}
