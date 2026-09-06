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

  // Flow (`docs/FLOW.md`) is a full-screen takeover: no top bar, side rail,
  // bottom nav or persistent player strip underneath it. Previously
  // `FlowScreen`/`FlowEmptyState` faked this with a `fixed inset-0 z-40`
  // overlay from inside `{children}`, which still left the whole shell
  // mounted (and, briefly, painted) beneath it. Branching here instead means
  // the chrome is never rendered on `/flow` at all — the shared providers
  // above this component (playback, auth, motion) stay mounted either way,
  // so the persistent player's state survives navigating away from Flow.
  const isFlow = pathname === routes.flow();
  if (isFlow) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-dvh w-full">
      <RouteProgress />
      <a
        href="#main"
        className="akinti-skip-link rounded-key bg-paper-raised px-4 py-3 type-subhead text-ink shadow-sheet"
      >
        {t("skipToContent")}
      </a>

      <SideNav badges={badges} />
      <DesktopSideNav badges={badges} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar actions={topBarActions} />
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
              "min-w-0 flex-1 pb-[calc(var(--akinti-keyboard-h)+2rem)] md:pb-16",
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

      <MobilePlayerStrip />
      <NowPlayingBar />
      <BottomNav badges={badges} />
    </div>
  );
}
