"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActiveRoute, routes } from "@/config/routes";
import { BRAND, TERMS } from "@/config/terminology";
import { useCurrentUser } from "@/lib/auth";
import { useUnreadMessages } from "@/lib/messages";
import { useUnreadNotifications } from "@/lib/notifications";
import { cn } from "@/lib/ui";
import { CountBadge } from "@/components/ui";
import { Bell, Settings } from "@/components/ui/icons";

import { RAIL_ITEMS } from "./navItems";
import { UserMenu } from "./UserMenu";

export interface SideNavProps {
  /** Unread counts keyed by nav item, e.g. `{ messages: 2 }`. */
  badges?: Partial<Record<string, number>>;
  className?: string;
}

/**
 * The desktop adaptation of the keyboard (§8.1, SCREENS.md).
 *
 * At 768px the bar becomes a 72px icon rail; at 1024px a 200px labelled rail.
 * Same five destinations, same filled-glyph active state, same left-hung
 * alignment — the rail is the layout at every width (§5.4, §12.42).
 */
export function SideNav({ badges, className }: SideNavProps) {
  const pathname = usePathname();
  const { profile } = useCurrentUser();
  const { count: unreadNotifications } = useUnreadNotifications(profile?.id ?? null);
  const { count: unreadMessages } = useUnreadMessages(profile?.id ?? null);

  const railLink = cn(
    "akinti-press flex h-12 items-center gap-4 rounded-key px-3 transition-colors",
    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-tide",
  );

  return (
    <div
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col gap-6 border-r border-hairline",
        "w-18 px-3 py-5 md:flex lg:w-50 lg:px-4",
        className,
      )}
    >
      <Link
        href={routes.home()}
        className="inline-flex h-11 items-center px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
      >
        {/* The wordmark is the word, so it appears only where the word fits:
            the 72px icon rail carries navigation, not a monogram (§8.2). */}
        <span className="type-wordmark text-ink max-lg:sr-only">{BRAND}</span>
      </Link>

      <nav aria-label="Primary" className="flex-1">
        <ul className="flex flex-col gap-1">
          {RAIL_ITEMS.map((item) => {
            const href =
              item.key === "profile"
                ? profile
                  ? routes.profile(profile.username)
                  : routes.login(pathname)
                : item.href;
            const active = isActiveRoute(pathname, href);
            const Icon = item.icon;
            const liveBadge = item.key === "messages" ? unreadMessages : 0;
            const badge = badges?.[item.key] ?? liveBadge;

            return (
              <li key={item.key}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    railLink,
                    active ? "text-ink" : "text-ink-muted hover:text-ink",
                  )}
                >
                  <span className="relative inline-flex shrink-0">
                    {Icon ? (
                      <Icon
                        className="size-6"
                        aria-hidden="true"
                        weight={active ? "fill" : "regular"}
                      />
                    ) : null}
                    {badge > 0 ? (
                      <CountBadge
                        count={badge}
                        label={`unread ${item.label.toLowerCase()}`}
                        className="absolute -top-1.5 -right-2.5 lg:hidden"
                      />
                    ) : null}
                  </span>
                  <span className="type-subhead flex-1 truncate max-lg:sr-only">
                    {item.label}
                  </span>
                  {badge > 0 ? (
                    <CountBadge
                      count={badge}
                      label={`unread ${item.label.toLowerCase()}`}
                      className="max-lg:hidden"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}

          <li>
            <Link
              href={routes.notifications()}
              aria-current={
                isActiveRoute(pathname, routes.notifications()) ? "page" : undefined
              }
              className={cn(
                railLink,
                isActiveRoute(pathname, routes.notifications())
                  ? "text-ink"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              <span className="relative inline-flex shrink-0">
                <Bell
                  className="size-6"
                  aria-hidden="true"
                  weight={
                    isActiveRoute(pathname, routes.notifications()) ? "fill" : "regular"
                  }
                />
                {unreadNotifications > 0 ? (
                  <CountBadge
                    count={unreadNotifications}
                    label="unread notifications"
                    className="absolute -top-1.5 -right-2.5 lg:hidden"
                  />
                ) : null}
              </span>
              <span className="type-subhead flex-1 truncate max-lg:sr-only">
                {TERMS.notifications}
              </span>
              {unreadNotifications > 0 ? (
                <CountBadge
                  count={unreadNotifications}
                  label="unread notifications"
                  className="max-lg:hidden"
                />
              ) : null}
            </Link>
          </li>
        </ul>
      </nav>

      <div className="flex flex-col gap-3">
        <UserMenu className="self-start" />

        {/* Record is the one key on this rail: the current at rest, per
            COLOR_V2's record key rule, never a pill. */}
        <Link
          href={routes.create()}
          aria-label={`${TERMS.record} ${TERMS.aWave}`}
          className={cn(
            "akinti-press inline-flex h-12 items-center justify-center gap-3 rounded-key bg-tide",
            "type-subhead text-on-ink transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide",
          )}
        >
          <span aria-hidden="true" className="size-3.5 shrink-0 rounded-full bg-signal" />
          <span aria-hidden="true" className="max-lg:hidden">
            {TERMS.record}
          </span>
        </Link>

        <Link
          href={routes.settings()}
          className={cn(
            railLink,
            isActiveRoute(pathname, routes.settings())
              ? "text-ink"
              : "text-ink-muted hover:text-ink",
          )}
        >
          <Settings
            className="size-6 shrink-0"
            aria-hidden="true"
            weight={isActiveRoute(pathname, routes.settings()) ? "fill" : "regular"}
          />
          <span className="type-subhead max-lg:sr-only">{TERMS.settings}</span>
        </Link>
      </div>
    </div>
  );
}
