import { getTranslations } from "next-intl/server";

import { RouteLoading, Skeleton } from "@/components/ui";

/**
 * Flow's loading state. Flow is a full-screen takeover with no `AppShell`
 * chrome (`AppShell.tsx`'s `isFlow` branch), so this is full-bleed too rather
 * than a page-column skeleton — the closest a Suspense fallback can get to
 * matching the real screen's frame before the client component mounts.
 */
export default async function FlowLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading
      label={t("routeLoading")}
      className="flex h-dvh w-full flex-col items-center justify-center gap-6 bg-paper px-6"
    >
      <Skeleton shape="circle" className="size-16 rounded-[22px]" />
      <div className="flex w-full max-w-xs flex-col items-center gap-2">
        <Skeleton shape="line" width="50%" />
        <Skeleton shape="waterline" />
      </div>
    </RouteLoading>
  );
}
