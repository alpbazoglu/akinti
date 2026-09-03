import type { ReactNode } from "react";

import { cn } from "@/lib/ui";

import { BottomNav } from "./BottomNav";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";

export interface AppShellProps {
  children: ReactNode;
  /** Mobile header title. Omit to show the wordmark. */
  title?: string;
  /** Unread counts keyed by nav item: `messages`, `notifications`. */
  badges?: Partial<Record<string, number>>;
  /** Extra trailing controls in the mobile header. */
  topBarActions?: ReactNode;
  /** Optional secondary column shown on wide screens. */
  aside?: ReactNode;
  className?: string;
}

/**
 * The application shell: a bottom bar on mobile, a navigation rail on desktop
 * (spec section 7), with a single centred content column so a Wave card reads
 * at a comfortable measure on every screen.
 */
export function AppShell({
  children,
  title,
  badges,
  topBarActions,
  aside,
  className,
}: AppShellProps) {
  const unreadMessages = badges?.messages ?? 0;

  return (
    <div className="flex min-h-dvh w-full">
      <a href="#main" className="akinti-skip-link rounded-md bg-surface px-3 py-2 text-sm font-medium text-fg shadow-md">
        Skip to content
      </a>

      <SideNav badges={badges} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} unreadMessages={unreadMessages} actions={topBarActions} />

        <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-0 md:px-6">
          <main
            id="main"
            tabIndex={-1}
            className={cn(
              "min-w-0 flex-1 pb-[calc(var(--akinti-bottom-nav-h)+2rem)] md:pb-10",
              "md:max-w-[var(--akinti-content-max)]",
              className,
            )}
          >
            {children}
          </main>

          {aside ? (
            <aside className="hidden w-72 shrink-0 py-6 lg:block">{aside}</aside>
          ) : null}
        </div>
      </div>

      <BottomNav badges={badges} />
    </div>
  );
}
