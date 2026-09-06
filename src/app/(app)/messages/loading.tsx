import { getTranslations } from "next-intl/server";

import { RouteLoading, Skeleton, SkeletonPageHeader, SkeletonRow, SkeletonRowList } from "@/components/ui";

/**
 * Covers `/messages`, `/messages/[id]` and `/messages/new`. Shaped to
 * `MessagesDesktopFrame`'s real split at `>= 1024px` — a 320px thread list
 * plus a content pane, inside the same bordered panel the real shell draws
 * — and to the single mobile list below that width.
 */
export default async function MessagesLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")} className="flex flex-col">
      <div className="hidden h-[calc(100dvh-var(--akinti-top-bar-h)-var(--akinti-now-playing-h,5.5rem))] overflow-hidden rounded-card border border-hairline lg:flex">
        <div className="flex w-80 shrink-0 flex-col border-r border-hairline">
          <div className="flex flex-col gap-3 px-5 pt-6 pb-4">
            <Skeleton shape="line" width="6rem" className="h-6" />
            <Skeleton shape="block" height="2.5rem" />
          </div>
          <SkeletonRowList count={7} className="px-4" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-6">
          <SkeletonRow />
          <Skeleton shape="block" height="2.5rem" className="ml-auto w-2/3" />
          <Skeleton shape="block" height="2.5rem" className="mr-auto w-1/2" />
          <Skeleton shape="block" height="2.5rem" className="ml-auto w-3/5" />
        </div>
      </div>

      <div className="lg:hidden">
        <SkeletonPageHeader />
        <SkeletonRowList count={8} />
      </div>
    </RouteLoading>
  );
}
