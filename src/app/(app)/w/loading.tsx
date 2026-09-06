import { getTranslations } from "next-intl/server";

import { RouteLoading, Skeleton, SkeletonPageHeader, SkeletonRowList } from "@/components/ui";

/** Covers `/w/[id]`, `/w/[id]/duet` and `/w/[id]/duet/record`: one large trace, then the comment thread. */
export default async function WaveLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <div className="akinti-page mb-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Skeleton shape="circle" className="size-14 rounded-[19px]" />
          <div className="flex flex-col gap-2">
            <Skeleton shape="line" width="10rem" />
            <Skeleton shape="line" width="6rem" className="h-2.5 opacity-70" />
          </div>
        </div>
        <Skeleton shape="waterline" className="h-8" />
      </div>
      <SkeletonRowList count={4} />
    </RouteLoading>
  );
}
