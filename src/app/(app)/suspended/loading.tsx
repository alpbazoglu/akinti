import { getTranslations } from "next-intl/server";

import { RouteLoading, SkeletonFormRows, SkeletonPageHeader } from "@/components/ui";

export default async function SuspendedLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <SkeletonFormRows count={2} />
    </RouteLoading>
  );
}
