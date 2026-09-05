"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Settings, User as UserIcon } from "@/components/ui/icons";

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
      <div className={cn("flex items-center gap-4", className)}>
        <Link
          href={routes.login(pathname)}
          className={cn(
            "akinti-press inline-flex h-10 items-center justify-center type-subhead",
            "text-ink underline decoration-hairline-strong decoration-1 underline-offset-[3px]",
            "transition-colors hover:decoration-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide",
          )}
        >
          {TERMS.logIn}
        </Link>
        <Link
          href={routes.signup()}
          className={cn(
            // The primary action here, so it takes the current fill, paper
            // label (COLOR_V2 "Buttons").
            "akinti-press inline-flex h-10 items-center justify-center rounded-key bg-tide px-4",
            "type-subhead text-on-ink transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide",
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
        // Awaited, then a real hard navigation (not `router.push`): calling
        // this Server Action directly from a menu item — outside a
        // `<form action>` or `startTransition` — doesn't reliably land the
        // client on the redirect target (reproduced as sign-out leaving the
        // previous, still-signed-in page rendered instead of navigating to
        // `/login`). A full page load also guarantees every bit of client
        // auth state (`AuthProvider`, cached queries) resets, on every
        // surface this menu renders in (mobile `TopBar`, desktop `SideNav`).
        void signOut().then((result) => {
          window.location.assign(result.redirectTo ?? routes.login());
        });
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
          aria-label={`${name}, account menu`}
          className={cn(
            "akinti-press inline-flex items-center gap-3 rounded-[13px] transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide",
            size === "sm" ? "size-11 justify-center" : "h-11 px-1.5",
          )}
        >
          <Avatar name={name} src={profile?.avatarUrl} size="sm" />
          {size === "md" ? (
            <span className="type-subhead max-w-28 truncate text-ink max-lg:sr-only">{name}</span>
          ) : null}
        </button>
      )}
    />
  );
}
