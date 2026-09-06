import { getTranslations } from "next-intl/server";

import { RouteLoading, Skeleton, SkeletonPageHeader, SkeletonRowList } from "@/components/ui";

/**
 * Covers `/w/[id]`, `/w/[id]/duet` and `/w/[id]/duet/record`.
 *
 * Below 1024px: one large trace, then the comment thread, unchanged. At
 * `>= 1024px` the real page is two columns (trace/actions capped at 800px,
 * a 320px right rail with the creator card, OwnerInsights and the Duet
 * chain — `WaveCreatorCard`, added alongside the desktop-screens pass), so
 * the skeleton's main column narrows and gains a matching rail at that
 * width rather than stretching the single mobile column full-bleed under
 * the desktop shell.
 */
export default async function WaveLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-10">
        <div className="min-w-0 flex-1 lg:max-w-[800px]">
          <div className="akinti-page mb-6 flex flex-col gap-4">
            <div className="flex items-center gap-3 lg:hidden">
              <Skeleton shape="circle" className="size-14 rounded-[19px]" />
              <div className="flex flex-col gap-2">
                <Skeleton shape="line" width="10rem" />
                <Skeleton shape="line" width="6rem" className="h-2.5 opacity-70" />
              </div>
            </div>
            <Skeleton shape="waterline" className="h-8" />
          </div>
          <SkeletonRowList count={4} />
        </div>

        <div className="hidden w-full shrink-0 flex-col gap-6 lg:flex lg:w-right-rail">
          <div className="flex flex-col gap-4 rounded-card border border-hairline bg-elevation-2 p-4">
            <div className="flex items-center gap-3">
              <Skeleton shape="circle" className="size-14 rounded-[19px]" />
              <div className="flex flex-col gap-2">
                <Skeleton shape="line" width="8rem" />
                <Skeleton shape="line" width="5rem" className="h-2.5 opacity-70" />
              </div>
            </div>
            <Skeleton shape="line" width="6rem" className="h-9 rounded-key" />
          </div>
          <Skeleton shape="block" height="8rem" className="rounded-card" />
        </div>
      </div>
    </RouteLoading>
  );
}
