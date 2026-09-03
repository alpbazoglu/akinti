"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Settings, User as UserIcon } from "lucide-react";

import { signOut } from "@/app/(auth)/actions";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { useCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/ui";
import { Avatar, Menu, type MenuItem } from "@/components/ui";

export interface UserMenuProps {
  /** Compact avatar for the mobile top bar; avatar + name on the desktop rail. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * The signed-in/signed-out identity slot shared by `TopBar` (mobile) and
 * `SideNav` (desktop) — one component so the auth affordance never drifts
 * between the two chromes (dev rule 3: no duplicate components).
 */
export function UserMenu({ size = "md", className }: UserMenuProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile } = useCurrentUser();

  if (!user) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Link
          href={routes.login(pathname)}
          className={cn(
            "inline-flex h-8 items-center justify-center rounded-full px-3 text-[0.8125rem] font-medium",
            "text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          {TERMS.logIn}
        </Link>
        <Link
          href={routes.signup()}
          className={cn(
            "inline-flex h-8 items-center justify-center rounded-full bg-accent px-3 text-[0.8125rem] font-medium",
            "text-fg-on-accent shadow-xs transition-colors hover:bg-accent-hover active:bg-accent-active",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          {TERMS.signUp}
        </Link>
      </div>
    );
  }

  const name = profile?.displayName ?? profile?.username ?? user.email ?? "Account";

  const items: MenuItem[] = [
    {
      id: "profile",
      label: TERMS.profile,
      icon: <UserIcon className="size-4" />,
      disabled: !profile,
      onSelect: () => {
        if (profile) {
          router.push(routes.profile(profile.username));
        }
      },
    },
    {
      id: "settings",
      label: TERMS.settings,
      icon: <Settings className="size-4" />,
      onSelect: () => router.push(routes.settings()),
    },
    {
      id: "sign-out",
      label: TERMS.logOut,
      icon: <LogOut className="size-4" />,
      destructive: true,
      onSelect: () => {
        void signOut();
      },
    },
  ];

  return (
    <Menu
      label="Account"
      align="end"
      className={className}
      items={items}
      trigger={(triggerProps) => (
        <button
          {...triggerProps}
          type="button"
          aria-label={`${name} — account menu`}
          className={cn(
            "inline-flex items-center gap-2 rounded-full transition-colors",
            "hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            size === "sm" ? "p-0.5" : "p-1 pr-2.5",
          )}
        >
          <Avatar name={name} src={profile?.avatarUrl} size="sm" />
          {size === "md" ? (
            <span className="max-w-28 truncate text-sm font-medium text-fg">{name}</span>
          ) : null}
        </button>
      )}
    />
  );
}
