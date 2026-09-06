"use client";

/**
 * The desktop top bar (`docs/design/DESIGN_V3_DESKTOP.md` "Shell": "56px:
 * back/forward, search opening a command palette on ⌘K/Ctrl+K, notifications,
 * avatar"). Renders only at `lg` (>= 1024px); `TopBar.tsx` keeps serving the
 * mobile 56px bar unchanged below that width — the two never overlap.
 */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { routes } from "@/config/routes";
import { useCurrentUser } from "@/lib/auth";
import { useUnreadNotifications } from "@/lib/notifications";
import { cn } from "@/lib/ui";
import { CountBadge, IconButton } from "@/components/ui";
import { ArrowLeft, ArrowRight, Bell } from "@/components/ui/icons";

import { CommandPalette } from "./CommandPalette";
import { UserMenu } from "./UserMenu";

export interface DesktopTopBarProps {
  unreadNotifications?: number;
  className?: string;
}

export function DesktopTopBar({ unreadNotifications, className }: DesktopTopBarProps) {
  const router = useRouter();
  const { profile } = useCurrentUser();
  const { count: liveUnreadNotifications } = useUnreadNotifications(profile?.id ?? null);
  const notificationsBadge = unreadNotifications ?? liveUnreadNotifications;
  const t = useTranslations("Terms");
  const tLayout = useTranslations("Layout");

  return (
    <header
      className={cn(
        "sticky top-0 z-20 hidden h-top-bar items-center gap-4 border-b border-hairline bg-elevation-1 px-8 lg:flex",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-1">
        <IconButton
          label={tLayout("goBack")}
          icon={<ArrowLeft className="size-4" aria-hidden="true" />}
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
        />
        <IconButton
          label={tLayout("goForward")}
          icon={<ArrowRight className="size-4" aria-hidden="true" />}
          variant="ghost"
          size="sm"
          onClick={() => router.forward()}
        />
      </div>

      <div className="min-w-0 flex-1">
        <CommandPalette />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="relative">
          <IconButton
            label={t("notifications")}
            icon={<Bell className="size-4" aria-hidden="true" />}
            variant="ghost"
            size="sm"
            onClick={() => router.push(routes.notifications())}
          />
          {notificationsBadge > 0 ? (
            <CountBadge
              count={notificationsBadge}
              label={tLayout("unreadNotifications")}
              className="pointer-events-none absolute top-0.5 right-0.5"
            />
          ) : null}
        </div>
        <UserMenu size="sm" />
      </div>
    </header>
  );
}
