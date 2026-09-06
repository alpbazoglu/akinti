"use client";

import type { ReactNode } from "react";

import { useIsDesktopViewport } from "@/lib/ui";

import { SettingsNavPane } from "./SettingsNavPane";

/**
 * Splits every route under `/settings` into a 224px nav rail plus the
 * route's own content at `>= 1024px` (`DESIGN_V3_DESKTOP.md`: "settings nav
 * left (icons, active state) + form right"). The nav stays visible while the
 * form column scrolls (`lg:sticky`), the same convenience `DesktopSideNav`
 * gives the whole app.
 *
 * Below 1024px this renders `children` alone — the mobile settings hub
 * (`/settings`'s own grouped list) is untouched.
 */
export function SettingsDesktopFrame({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktopViewport();

  if (!isDesktop) {
    return <>{children}</>;
  }

  return (
    <div className="flex items-start gap-10">
      <aside className="sticky top-[calc(var(--akinti-top-bar-h)+2.5rem)] w-56 shrink-0 pt-9">
        <SettingsNavPane />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
