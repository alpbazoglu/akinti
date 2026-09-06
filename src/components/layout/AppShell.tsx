"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { routes } from "@/config/routes";
import { cn } from "@/lib/ui";

import { BottomNav } from "./BottomNav";
import { DesktopSideNav } from "./DesktopSideNav";
import { DesktopTopBar } from "./DesktopTopBar";
import { NowPlayingBar } from "./NowPlayingBar";
import { MobilePlayerStrip } from "./PersistentPlayer";
import { RouteProgress } from "./RouteProgress";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";

export interface AppShellProps {
  children: ReactNode;
  /** Unread counts keyed by nav item: `messages`, `notifications`. */
  badges?: Partial<Record<string, number>>;
  /** Extra trailing controls in the mobile top bar. */
  topBarActions?: ReactNode;
  /** Contextual column shown at 1024px and above. Stays empty when there is
   * nothing contextual to show — filler is worse than space. */
  aside?: ReactNode;
  className?: string;
}

/**
 * The application shell (§8.1, §8.2, SCREENS.md).
 *
 * Mobile: a 56px top bar and the 64px keyboard, both clearing the safe areas,
 * on a `100dvh` frame (§12.43).
 *
 * 768px: the keyboard becomes a 72px icon rail. 1024px: a 200px labelled rail,
 * a 600px content column and a 300px contextual column. The content column is
 * left-hung against the rail at every width; nothing is centred (§12.42), which
 * is what fixes the audit's "40-50% of a 1280px viewport is dead grey space".
 */
export function AppShell({
  children,
  badges,
  topBarActions,
  aside,
  className,
}: AppShellProps) {
  const pathname = usePathname();
  const t = useTranslations("Layout");

  // Flow (`docs/FLOW.md`, amended by `docs/design/DESIGN_V3_DESKTOP.md`'s
  // shell section — "optional right rail 320px on Flow/Wave") is a
  // full-screen takeover ONLY below 1024px: no top bar, side rail, bottom
  // nav or persistent player strip underneath it there. At 1024px and above
  // it sits inside the normal desktop shell like every other screen, with
  // its own `aside` slot reaching it exactly the way Explore's or Wave's
  // does (flagged by the desktop-screens agent building Flow's desktop
  // layout: the previous unconditional early return skipped the shell, and
  // therefore the `aside` slot, at every viewport).
  //
  // This can't be two separate JSX branches with `{children}` mounted in
  // each (one CSS-hidden below lg, one above) — that would mount Flow's
  // screen component twice at once, double-firing its data fetches and
  // audio/session side effects. Instead `{children}` renders exactly once,
  // in the same `<main>` used everywhere else, and only the four
  // components that exist purely to be mobile/tablet chrome (`SideNav`,
  // `TopBar`, `BottomNav`, `MobilePlayerStrip` — each already invisible at
  // >= 1024px via its own breakpoint classes) are skipped for this route.
  // `DesktopSideNav`/`DesktopTopBar`/`NowPlayingBar`/`RouteProgress` already
  // self-hide below 1024px the same way, so leaving them mounted costs
  // nothing below that width and needs no Flow-specific branching at all.
  const isFlow = pathname === routes.flow();

  return (
    <div className="flex min-h-dvh w-full">
      <RouteProgress />
      <a
        href="#main"
        className="akinti-skip-link rounded-key bg-paper-raised px-4 py-3 type-subhead text-ink shadow-sheet"
      >
        {t("skipToContent")}
      </a>

      {isFlow ? null : <SideNav badges={badges} />}
      <DesktopSideNav badges={badges} />

      <div className="flex min-w-0 flex-1 flex-col">
        {isFlow ? null : <TopBar actions={topBarActions} />}
        <DesktopTopBar />

        {/* No `lg:max-w-*` cap on this row: DESIGN_V3_DESKTOP.md's "main
            column fluid, max 1280px, 32px gutters" replaces the old fixed
            1160px frame that left 40-58% of a wide desktop viewport as flat
            paper (`docs/research/desktop/FEEDBACK_AUDIT.md` #5) — the cap now
            lives on `<main>` itself, and the row is free to fill whatever
            width the viewport actually has. */}
        <div className="flex w-full min-w-0 flex-1 gap-8 lg:px-desktop-gutter">
          <main
            id="main"
            tabIndex={-1}
            className={cn(
              "min-w-0 flex-1",
              // Flow's mobile/tablet takeover reserves no space for the
              // keyboard or a bottom nav bar, because this pass doesn't
              // render either of them for Flow below 1024px (see above).
              isFlow ? "pb-0" : "pb-[calc(var(--akinti-keyboard-h)+2rem)] md:pb-16",
              "lg:max-w-desktop-content lg:pb-[calc(var(--akinti-now-playing-h)+2rem)]",
              className,
            )}
          >
            {children}
          </main>

          {aside ? (
            <aside className="hidden w-right-rail shrink-0 flex-col gap-8 py-8 lg:flex">
              {aside}
            </aside>
          ) : null}
        </div>
      </div>

      {isFlow ? null : <MobilePlayerStrip />}
      <NowPlayingBar />
      {isFlow ? null : <BottomNav badges={badges} />}
    </div>
  );
}
