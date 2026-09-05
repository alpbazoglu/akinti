"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { routes } from "@/config/routes";
import { BRAND, TERMS } from "@/config/terminology";
import { useCurrentUser } from "@/lib/auth";
import { useUnreadNotifications } from "@/lib/notifications";
import { cn } from "@/lib/ui";
import { CountBadge } from "@/components/ui";
import { Bell, Search } from "@/components/ui/icons";

import { UserMenu } from "./UserMenu";

export interface TopBarProps {
  /** Unread notifications count. Defaults to the live count when omitted. */
  unreadNotifications?: number;
  /** Extra trailing controls, e.g. an overflow menu. */
  actions?: ReactNode;
  /** Show the Search entry point. */
  showSearch?: boolean;
  className?: string;
}

/**
 * The top bar (§8.2).
 *
 * 56px, carrying the wordmark and up to three 24px icon controls. A screen has
 * at most two bars, never three, and the page title is **not** one of them: it
 * is a 32px `display` heading that lives in the content and scrolls away
 * (§12.9). There is no title-plus-subtitle block stamped on every screen.
 *
 * The wordmark is the word. `AKINTI` set in Archivo at `wdth 118`, weight 500,
 * 15px, +8% tracking, in ink. There is no accompanying vertical-bars glyph: an
 * abstract waveform mark reads as "some audio thing", not as an identity, and
 * it collides with the rule that a waveform is a display and never an icon
 * (§6.4, §12.8).
 */
export function TopBar({
  unreadNotifications,
  actions,
  showSearch = true,
  className,
}: TopBarProps) {
  const { profile } = useCurrentUser();
  const { count: liveUnreadNotifications } = useUnreadNotifications(profile?.id ?? null);
  const notificationsBadge = unreadNotifications ?? liveUnreadNotifications;

  return (
    <header
      className={cn(
        "akinti-page akinti-safe-top sticky top-0 z-20 flex h-top-bar items-center gap-2",
        "border-b border-hairline bg-paper md:hidden",
        className,
      )}
    >
      <Link
        href={routes.home()}
        className="inline-flex min-w-0 flex-1 items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
      >
        <span className="type-wordmark truncate text-ink">{BRAND}</span>
      </Link>

      <div className="flex shrink-0 items-center gap-1">
        {showSearch ? (
          <Link
            href={routes.explore()}
            aria-label={TERMS.search}
            className={cn(
              "akinti-press inline-flex size-11 items-center justify-center rounded-[13px] text-ink-muted",
              "transition-colors hover:text-ink",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide",
            )}
          >
            <Search className="size-6" aria-hidden="true" />
          </Link>
        ) : null}

        <Link
          href={routes.notifications()}
          aria-label={TERMS.notifications}
          className={cn(
            "akinti-press relative inline-flex size-11 items-center justify-center rounded-[13px] text-ink-muted",
            "transition-colors hover:text-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide",
          )}
        >
          <Bell className="size-6" aria-hidden="true" />
          {notificationsBadge > 0 ? (
            <CountBadge
              count={notificationsBadge}
              label="unread notifications"
              className="absolute top-1 right-1"
            />
          ) : null}
        </Link>

        <UserMenu size="sm" />

        {actions}
      </div>
    </header>
  );
}
