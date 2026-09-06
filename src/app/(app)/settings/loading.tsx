import { getTranslations } from "next-intl/server";

import { RouteLoading, Skeleton, SkeletonFormRows, SkeletonPageHeader, SkeletonProfileHeader, SkeletonRowList } from "@/components/ui";

const NAV_GROUP_SIZES = [3, 3, 2] as const;

/**
 * Covers `/settings` and every subpage. Shaped to `SettingsDesktopFrame`'s
 * real split at `>= 1024px` — a 224px icon+label nav rail, grouped exactly
 * like `SettingsNavPane`'s three clusters, plus a form column — and to the
 * single mobile hub list below that width.
 */
export default async function SettingsLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")} className="flex flex-col">
      <div className="akinti-page hidden items-start gap-10 lg:flex">
        <div className="flex w-56 shrink-0 flex-col gap-6 pt-9">
          <Skeleton shape="line" width="5rem" className="h-6" />
          {NAV_GROUP_SIZES.map((size, groupIndex) => (
            <div key={groupIndex} className="flex flex-col gap-3 border-t border-hairline pt-3 first:border-t-0 first:pt-0">
              {Array.from({ length: size }, (_, rowIndex) => (
                <div key={rowIndex} className="flex items-center gap-3 px-3 py-2">
                  <Skeleton shape="circle" className="size-5 rounded-md" />
                  <Skeleton shape="line" width="60%" />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <SkeletonFormRows count={5} />
        </div>
      </div>

      <div className="lg:hidden">
        <SkeletonPageHeader />
        <SkeletonProfileHeader />
        <SkeletonRowList count={7} withAvatar={false} />
      </div>
    </RouteLoading>
  );
}
