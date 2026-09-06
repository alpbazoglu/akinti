import { getTranslations } from "next-intl/server";

import { RouteLoading, SkeletonPageHeader, SkeletonRowList } from "@/components/ui";

export default async function ModerationLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <SkeletonRowList count={6} withAvatar={false} />
    </RouteLoading>
  );
}
