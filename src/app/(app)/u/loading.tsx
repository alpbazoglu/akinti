import { getTranslations } from "next-intl/server";

import { RouteLoading, SkeletonCardGrid, SkeletonProfileHeader } from "@/components/ui";

/** Covers `/u/[username]`, `/u/[username]/followers` and `/u/[username]/following`. */
export default async function ProfileLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonProfileHeader />
      <SkeletonCardGrid count={6} />
    </RouteLoading>
  );
}
