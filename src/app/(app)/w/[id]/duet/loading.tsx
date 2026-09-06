import { getTranslations } from "next-intl/server";

import { RouteLoading, Skeleton, SkeletonPageHeader } from "@/components/ui";

/**
 * `/w/[id]/duet` (this pass's brief, item 3). Shaped to what
 * `DuetRequestPage` actually renders — `WaveCardContainer` (rail row, a
 * waveform, transport) above `DuetRequestForm` (a message field, then the
 * submit key) — in the same single centred column at every width; the
 * request page has had no desktop-specific layout pass of its own, so this
 * skeleton does not invent a two-column shape it would not match.
 */
export default async function DuetRequestLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")} className="flex flex-col">
      <SkeletonPageHeader />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-16 sm:px-5">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Skeleton shape="circle" className="size-11" />
            <div className="flex flex-col gap-1.5">
              <Skeleton shape="line" width="8rem" />
              <Skeleton shape="line" width="5rem" className="h-3" />
            </div>
          </div>
          <Skeleton shape="waterline" className="h-14" />
          <div className="flex items-center gap-6">
            <Skeleton shape="circle" className="size-10" />
            <Skeleton shape="circle" className="size-10" />
            <Skeleton shape="circle" className="size-10" />
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-hairline pt-5">
          <Skeleton shape="block" height="6rem" />
          <Skeleton shape="block" height="3.25rem" />
        </div>
      </div>
    </RouteLoading>
  );
}
