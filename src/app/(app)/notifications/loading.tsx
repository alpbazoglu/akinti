import { getTranslations } from "next-intl/server";

import { RouteLoading, SkeletonPageHeader, SkeletonRowList } from "@/components/ui";

export default async function NotificationsLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <SkeletonRowList count={8} />
    </RouteLoading>
  );
}
