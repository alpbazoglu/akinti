import { getTranslations } from "next-intl/server";

import { RouteLoading, Skeleton } from "@/components/ui";

/**
 * Flow's loading state.
 *
 * Below 1024px Flow is still a full-screen takeover with no `AppShell`
 * chrome, so the mobile branch stays full-bleed and centred — the closest a
 * Suspense fallback can get to matching that frame before the client
 * component mounts. At >= 1024px `AppShell` now renders its sidebar/top bar
 * around Flow (fixed alongside the desktop-screens pass — it previously
 * bypassed all chrome, at every viewport), and the real screen is a stage
 * capped at 720px plus a 320px right rail ("Up next", a Duet callout, a
 * comments preview), so the skeleton gets a second, `lg:`-only shape to
 * match rather than showing the mobile centred circle inside the desktop
 * shell.
 */
export default async function FlowLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")} className="contents">
      {/* Mobile / tablet: full-bleed takeover, unchanged. */}
      <div className="flex h-dvh w-full flex-col items-center justify-center gap-6 bg-paper px-6 lg:hidden">
        <Skeleton shape="circle" className="size-16 rounded-[22px]" />
        <div className="flex w-full max-w-xs flex-col items-center gap-2">
          <Skeleton shape="line" width="50%" />
          <Skeleton shape="waterline" />
        </div>
      </div>

      {/* Desktop: stage + right rail. */}
      <div className="hidden gap-10 py-2 lg:flex lg:items-start">
        <div className="flex min-h-[60vh] min-w-0 flex-1 flex-col justify-center gap-8 lg:max-w-[720px]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <Skeleton shape="circle" className="size-10 rounded-[13px]" />
              <Skeleton shape="line" width="8rem" />
            </div>
            <Skeleton shape="line" width="16rem" className="h-6" />
          </div>
          <Skeleton shape="waterline" className="h-[220px]" />
          <div className="flex justify-center">
            <Skeleton shape="circle" className="size-[4.5rem]" />
          </div>
          <div className="flex gap-2.5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} shape="line" width="5rem" className="h-11 rounded-key" />
            ))}
          </div>
        </div>

        <div className="flex w-right-rail shrink-0 flex-col gap-8">
          <div className="flex flex-col gap-3">
            <Skeleton shape="line" width="6rem" className="h-3" />
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton shape="circle" className="size-9 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton shape="line" width="70%" />
                  <Skeleton shape="line" width="45%" className="h-2.5 opacity-70" />
                </div>
              </div>
            ))}
          </div>
          <Skeleton shape="block" height="10rem" className="rounded-card" />
        </div>
      </div>
    </RouteLoading>
  );
}
