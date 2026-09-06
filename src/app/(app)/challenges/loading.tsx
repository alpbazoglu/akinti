import { getTranslations } from "next-intl/server";

import { RouteLoading, SkeletonCardGrid, SkeletonPageHeader } from "@/components/ui";

/** Covers `/challenges` and `/challenges/[slug]`. */
export default async function ChallengesLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <SkeletonCardGrid count={6} />
    </RouteLoading>
  );
}
