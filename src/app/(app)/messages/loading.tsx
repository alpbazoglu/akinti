import { getTranslations } from "next-intl/server";

import { RouteLoading, SkeletonPageHeader, SkeletonRowList } from "@/components/ui";

/** Covers `/messages`, `/messages/[id]` and `/messages/new` — the nearest ancestor `loading.tsx` wraps every nested segment's Suspense boundary. */
export default async function MessagesLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <SkeletonRowList count={8} />
    </RouteLoading>
  );
}
