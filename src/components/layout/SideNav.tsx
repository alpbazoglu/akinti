"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AudioLines, Plus, Settings } from "lucide-react";

import { isActiveRoute, routes } from "@/config/routes";
import { BRAND, TERMS } from "@/config/terminology";
import { useCurrentUser } from "@/lib/auth";
import { useUnreadMessages } from "@/lib/messages";
import { useUnreadNotifications } from "@/lib/notifications";
import { cn } from "@/lib/ui";
import { CountBadge } from "@/components/ui";

import { SIDE_NAV_ITEMS } from "./navItems";
import { UserMenu } from "./UserMenu";

export interface SideNavProps {
  /** Unread counts keyed by nav item, e.g. `{ messages: 2 }`. Overrides the
   * live notifications badge when the `notifications` key is provided. */
  badges?: Partial<Record<string, number>>;
  className?: string;
}

/**
 * Desktop navigation rail (spec section 7). Messages gets its own item here,
 * and Create is a full-width action rather than one icon among five.
 */
export function SideNav({ badges, className }: SideNavProps) {
  const pathname = usePathname();
  const { profile } = useCurrentUser();
  const { count: unreadNotifications } = useUnreadNotifications(profile?.id ?? null);
  const { count: unreadMessages } = useUnreadMessages(profile?.id ?? null);

  return (
    <div
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col gap-6 border-r border-border",
        "w-[var(--akinti-side-nav-w)] px-4 py-5 md:flex",
        className,
      )}
    >
      <Link
        href={routes.home()}
        className="inline-flex items-center gap-2 rounded-md px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <AudioLines className="size-5 text-accent" aria-hidden="true" />
        <span className="text-base font-semibold tracking-[0.14em] text-fg">{BRAND}</span>
      </Link>

      <nav aria-label="Primary" className="flex-1">
        <ul className="flex flex-col gap-0.5">
          {SIDE_NAV_ITEMS.map((item) => {
            // The nav item table has no way to know who's signed in — resolve
            // the real destination here instead of leaving the "me" placeholder.
            const href =
              item.key === "profile"
                ? profile
                  ? routes.profile(profile.username)
                  : routes.login(pathname)
                : item.href;
            const active = isActiveRoute(pathname, href);
            const Icon = item.icon;
            const liveBadge =
              item.key === "notifications"
                ? unreadNotifications
                : item.key === "messages"
                  ? unreadMessages
                  : 0;
            const badge = badges?.[item.key] ?? liveBadge;

            return (
              <li key={item.key}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                    active
                      ? "bg-accent-soft font-semibold text-accent-soft-fg"
                      : "font-medium text-fg-muted hover:bg-surface-muted hover:text-fg",
                  )}
                >
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {badge > 0 ? (
                    <CountBadge count={badge} label={`unread ${item.label.toLowerCase()}`} />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-col gap-2">
        <UserMenu className="mb-1 self-start" />
        <Link
          href={routes.create()}
          className={cn(
            "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full",
            "bg-accent text-base font-medium text-fg-on-accent shadow-xs transition-colors",
            "hover:bg-accent-hover active:bg-accent-active",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <Plus className="size-5" aria-hidden="true" />
          {TERMS.create}
        </Link>
        <Link
          href={routes.settings()}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
            isActiveRoute(pathname, routes.settings())
              ? "bg-accent-soft text-accent-soft-fg"
              : "text-fg-muted hover:bg-surface-muted hover:text-fg",
          )}
        >
          <Settings className="size-5 shrink-0" aria-hidden="true" />
          {TERMS.settings}
        </Link>
      </div>
    </div>
  );
}
