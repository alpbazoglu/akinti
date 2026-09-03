"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AudioLines, MessageCircle, Search } from "lucide-react";

import { routes } from "@/config/routes";
import { BRAND, TERMS } from "@/config/terminology";
import { cn } from "@/lib/ui";
import { CountBadge } from "@/components/ui";

import { UserMenu } from "./UserMenu";

export interface TopBarProps {
  /** Page title. Falls back to the wordmark when omitted. */
  title?: string;
  /** Unread Messages count; Messages is not in the mobile bottom bar. */
  unreadMessages?: number;
  /** Extra trailing controls, e.g. an overflow menu. */
  actions?: ReactNode;
  /** Show the Search entry point. */
  showSearch?: boolean;
  className?: string;
}

/**
 * Mobile header. Keeps Messages one tap away with an unread badge, as
 * required by spec section 7 since it is not one of the five bottom slots.
 */
export function TopBar({
  title,
  unreadMessages = 0,
  actions,
  showSearch = true,
  className,
}: TopBarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-[var(--akinti-top-bar-h)] items-center gap-2",
        "border-b border-border bg-surface px-4 md:hidden",
        className,
      )}
    >
      {title ? (
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-fg">{title}</h1>
      ) : (
        <Link
          href={routes.home()}
          className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <AudioLines className="size-5 shrink-0 text-accent" aria-hidden="true" />
          <span className="truncate text-base font-semibold tracking-[0.14em] text-fg">
            {BRAND}
          </span>
        </Link>
      )}

      <div className="flex shrink-0 items-center gap-1">
        {showSearch ? (
          <Link
            href={routes.explore()}
            aria-label={TERMS.search}
            className={cn(
              "inline-flex size-10 items-center justify-center rounded-full text-fg-muted",
              "transition-colors hover:bg-surface-muted hover:text-fg",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            <Search className="size-5" aria-hidden="true" />
          </Link>
        ) : null}

        <Link
          href={routes.messages()}
          aria-label={TERMS.messages}
          className={cn(
            "relative inline-flex size-10 items-center justify-center rounded-full text-fg-muted",
            "transition-colors hover:bg-surface-muted hover:text-fg",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <MessageCircle className="size-5" aria-hidden="true" />
          {unreadMessages > 0 ? (
            <CountBadge
              count={unreadMessages}
              label="unread messages"
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
