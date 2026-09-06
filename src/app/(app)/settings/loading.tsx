import { getTranslations } from "next-intl/server";

import { RouteLoading, SkeletonPageHeader, SkeletonProfileHeader, SkeletonRowList } from "@/components/ui";

/** Covers `/settings` and every subpage (`account`, `appearance`, `audio`, `content/*`, `follow-requests`, `notifications`, `privacy`, `pro`, `safety`) — one ancestor `loading.tsx` wraps all of them. */
export default async function SettingsLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <SkeletonProfileHeader />
      <SkeletonRowList count={7} withAvatar={false} />
    </RouteLoading>
  );
}
