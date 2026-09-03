"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActiveRoute, routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { useCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/ui";
import { CountBadge } from "@/components/ui";

import { BOTTOM_NAV_ITEMS } from "./navItems";

export interface BottomNavProps {
  /** Unread counts keyed by nav item, e.g. `{ notifications: 3 }`. */
  badges?: Partial<Record<string, number>>;
  className?: string;
}

/**
 * Mobile primary navigation (spec section 7). Create sits in the middle as an
 * elevated action rather than a flat tab. Messages is not here; it lives in the
 * top bar with an unread badge and in the desktop rail.
 */
export function BottomNav({ badges, className }: BottomNavProps) {
  const pathname = usePathname();
  const { profile } = useCurrentUser();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "akinti-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface md:hidden",
        className,
      )}
    >
      <ul className="flex h-[var(--akinti-bottom-nav-h)] items-stretch">
        {BOTTOM_NAV_ITEMS.map((item) => {
          // Same resolution as `SideNav`: the nav item table has no notion of
          // who's signed in, so the real "Profile" destination is decided here.
          const href =
            item.key === "profile"
              ? profile
                ? routes.profile(profile.username)
                : routes.login(pathname)
              : item.href;
          const active = isActiveRoute(pathname, href);
          const Icon = item.icon;
          const badge = badges?.[item.key] ?? 0;

          if (item.emphasis) {
            return (
              <li key={item.key} className="flex flex-1 items-center justify-center">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mt-5 inline-flex size-14 items-center justify-center rounded-full",
                    "bg-accent text-fg-on-accent shadow-md transition-colors",
                    "hover:bg-accent-hover",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  )}
                >
                  <Icon className="size-6" aria-hidden="true" />
                  <span className="sr-only">
                    {TERMS.create} {TERMS.aWave}
                  </span>
                </Link>
              </li>
            );
          }

          return (
            <li key={item.key} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full flex-col items-center justify-center gap-1",
                  "text-[0.6875rem] font-medium transition-colors",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  active ? "text-accent" : "text-fg-subtle hover:text-fg",
                )}
              >
                <span className="relative inline-flex">
                  <Icon
                    className="size-5"
                    aria-hidden="true"
                    strokeWidth={active ? 2.25 : 1.75}
                  />
                  {badge > 0 ? (
                    <CountBadge
                      count={badge}
                      label={`unread ${item.label.toLowerCase()}`}
                      className="absolute -top-1.5 -right-2"
                    />
                  ) : null}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
