import { getTranslations } from "next-intl/server";

import { RouteLoading, SkeletonPageHeader, SkeletonWaveList } from "@/components/ui";

/** Home's loading state: the follow feed is a list of Wave rows (`docs/research/desktop/FEEDBACK_AUDIT.md` fix list item 1). */
export default async function HomeLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <SkeletonWaveList count={5} />
    </RouteLoading>
  );
}
