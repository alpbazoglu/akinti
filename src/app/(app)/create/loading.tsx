import { getTranslations } from "next-intl/server";

import { RouteLoading, Skeleton, SkeletonPageHeader } from "@/components/ui";

/**
 * Shaped to `RecordStage`'s real two-column split at `>= 1024px`
 * (`DESIGN_V3_DESKTOP.md`): a trace + transport on the left, a settings rail
 * on the right. Below that width the same markup stacks in one column,
 * matching `CreateFlow`'s own mobile layout. The trace uses `waterline` — a
 * flat resting line — because that is the real shape of a dormant trace
 * before anything is recorded (§8.15, §12.32), not a placeholder invented
 * for this skeleton.
 */
export default async function CreateLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")} className="flex flex-col">
      <SkeletonPageHeader />
      <div className="akinti-page flex flex-col gap-8 pb-24 lg:flex-row lg:items-start lg:gap-10">
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          <Skeleton shape="waterline" className="h-24" />
          <div className="flex items-baseline justify-between">
            <Skeleton shape="line" width="4rem" />
            <Skeleton shape="line" width="3rem" />
          </div>
          <div className="flex items-center justify-center py-2">
            <Skeleton shape="circle" className="size-22 rounded-full" />
          </div>
          <Skeleton shape="line" width="60%" />
        </div>
        <div className="flex flex-col gap-3 lg:w-[340px] lg:shrink-0">
          <Skeleton shape="block" height="3.5rem" />
          <Skeleton shape="block" height="3.5rem" />
          <Skeleton shape="block" height="3.5rem" />
          <Skeleton shape="block" height="3.5rem" />
        </div>
      </div>
    </RouteLoading>
  );
}
