import { getTranslations } from "next-intl/server";

import { RouteLoading, Skeleton, SkeletonPageHeader, SkeletonRowList } from "@/components/ui";

/** Matches `NotificationsView`'s real shape: the sticky "unread count / Mark all as read" bar, then grouped rows with an icon chip each — same at every width, since Notifications has no desktop-specific split layout. */
export default async function NotificationsLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")} className="flex flex-col">
      <SkeletonPageHeader />
      <div className="akinti-page flex items-center justify-between py-2">
        <Skeleton shape="line" width="5rem" className="h-2.5 opacity-70" />
        <Skeleton shape="line" width="6rem" />
      </div>
      <SkeletonRowList count={8} />
    </RouteLoading>
  );
}
