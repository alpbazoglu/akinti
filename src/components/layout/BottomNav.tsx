"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActiveRoute, routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { useCurrentUser } from "@/lib/auth";
import { useUnreadMessages } from "@/lib/messages";
import { cn } from "@/lib/ui";
import { CountBadge } from "@/components/ui";

import { KEYBOARD_ITEMS } from "./navItems";

export interface BottomNavProps {
  /** Unread counts keyed by nav item, e.g. `{ messages: 3 }`. Overrides the
   * live Messages badge when the `messages` key is provided. */
  badges?: Partial<Record<string, number>>;
  className?: string;
}

/**
 * The keyboard (§8.1).
 *
 * 64px plus safe area, five keys, labels always visible at `micro`, icons at
 * 24px. Active is a **filled** glyph plus full ink — not a colour change, not a
 * pill behind it, not an underline, not a glow. A hairline on the top edge, no
 * shadow, no blur, no translucency.
 *
 * The Record key is an ink squircle carrying a Signal lamp, sitting on the bar
 * like every other key. The previous build's raised teal circle was the
 * loudest generic signal in the app (§12.4).
 */
export function BottomNav({ badges, className }: BottomNavProps) {
  const pathname = usePathname();
  const { profile } = useCurrentUser();
  const { count: unreadMessages } = useUnreadMessages(profile?.id ?? null);

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "akinti-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-paper md:hidden",
        className,
      )}
    >
      <ul className="flex h-keyboard items-stretch">
        {KEYBOARD_ITEMS.map((item) => {
          // The nav table has no notion of who is signed in, so the real
          // "You" destination is decided here.
          const href =
            item.key === "profile"
              ? profile
                ? routes.profile(profile.username)
                : routes.login(pathname)
              : item.href;
          const active = isActiveRoute(pathname, href);
          const badge = badges?.[item.key] ?? (item.key === "messages" ? unreadMessages : 0);

          if (item.record) {
            return (
              <li key={item.key} className="flex flex-1 items-center justify-center">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  aria-label={`${TERMS.record} ${TERMS.aWave}`}
                  className={cn(
                    "akinti-press inline-flex size-11 items-center justify-center rounded-[13px] bg-ink",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                  )}
                >
                  {/* The lamp is the dot, not the key (§8.5). */}
                  <span aria-hidden="true" className="size-3.5 rounded-full bg-signal" />
                </Link>
              </li>
            );
          }

          const Icon = item.icon;

          return (
            <li key={item.key} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "akinti-press relative flex h-full flex-col items-center justify-center gap-1",
                  "type-micro transition-colors duration-[--dur-micro]",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink",
                  active ? "text-ink" : "text-ink-subtle hover:text-ink-muted",
                )}
              >
                <span className="relative inline-flex">
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
                      className="absolute -top-1.5 -right-2.5"
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
