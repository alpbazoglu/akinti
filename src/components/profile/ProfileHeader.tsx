import Link from "next/link";
import { Pencil } from "lucide-react";

import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import type { FollowStatus, Profile } from "@/types/domain";
import { Avatar } from "@/components/ui";
import { cn, formatCount, resolveProfileTheme } from "@/lib/ui";

import { FollowButton } from "./FollowButton";
import { ProfileOverflowMenu } from "./ProfileOverflowMenu";
import { ShareProfileButton } from "./ShareProfileButton";

/** Matches `Button`'s `variant="secondary" size="sm"` — used here because these are real
 *  navigations (Edit profile, Message), not actions, and must render as `<a>`, not `<button>`. */
const SECONDARY_LINK_BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 " +
  "text-[0.8125rem] font-medium text-fg transition-colors hover:bg-surface-muted " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export interface ProfileHeaderViewerState {
  isSelf: boolean;
  isSignedIn: boolean;
  followStatus: FollowStatus | null;
  /** True when this profile already follows the viewer back. */
  followsViewer: boolean;
  /** True when the viewer has blocked this profile (not the reverse — that state never renders at all). */
  isBlockedByViewer: boolean;
}

export interface ProfileHeaderProps {
  profile: Profile;
  viewer: ProfileHeaderViewerState;
  className?: string;
}

/**
 * Profile header (spec §21): themed banner, avatar, identity, counts, and
 * the Follow/Message/Share/Block/Report action row. Creation-type-agnostic —
 * this component knows nothing about Recorded/Uploaded/Duet, that lives
 * entirely on `WaveCard`.
 */
export function ProfileHeader({ profile, viewer, className }: ProfileHeaderProps) {
  const theme = resolveProfileTheme(profile.theme);
  const name = profile.displayName ?? profile.username;
  const bannerLayers = [theme.gradient.css, theme.pattern.backgroundImage].filter(
    (layer): layer is string => layer !== null,
  );

  return (
    <div className={cn("flex flex-col", className)}>
      <div
        aria-hidden="true"
        style={{
          backgroundColor: theme.background.hex,
          backgroundImage: bannerLayers.length > 0 ? bannerLayers.join(", ") : undefined,
          backgroundSize: theme.pattern.backgroundSize ?? undefined,
        }}
        className="h-28 w-full sm:h-36"
      />

      <div className="flex flex-col gap-4 px-4 pb-2 sm:px-5">
        <div className="flex items-end justify-between gap-3">
          <Avatar
            name={name}
            src={profile.avatarUrl}
            size="xl"
            className="-mt-10 shrink-0 ring-4 ring-surface sm:-mt-12"
          />

          <div className="flex items-center gap-2 pb-1">
            {viewer.isSelf ? (
              <Link href={routes.settingsAccount()} className={SECONDARY_LINK_BUTTON}>
                <Pencil className="size-4" aria-hidden="true" />
                {TERMS.editProfile}
              </Link>
            ) : (
              <>
                <FollowButton
                  profileId={profile.id}
                  initialFollowStatus={viewer.followStatus}
                  isSignedIn={viewer.isSignedIn}
                  followsViewer={viewer.followsViewer}
                />
                {/* Just the link (spec deliverable) — the compose flow itself is Messaging (Stage 10). */}
                <Link href={routes.messageNew(profile.username)} className={SECONDARY_LINK_BUTTON}>
                  {TERMS.message}
                </Link>
                <ShareProfileButton username={profile.username} />
                {viewer.isSignedIn ? (
                  <ProfileOverflowMenu
                    profileId={profile.id}
                    username={profile.username}
                    isBlocked={viewer.isBlockedByViewer}
                  />
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-fg">{name}</h1>
          <p className="text-sm text-fg-subtle">@{profile.username}</p>
          {profile.bio ? (
            <p className="mt-1 max-w-prose text-sm leading-relaxed whitespace-pre-line text-fg-muted">
              {profile.bio}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-4 text-sm">
          <Link
            href={routes.profileFollowers(profile.username)}
            className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="font-semibold text-fg tabular-nums">
              {formatCount(profile.counts.followers)}
            </span>{" "}
            <span className="text-fg-subtle">{TERMS.followers}</span>
          </Link>
          <Link
            href={routes.profileFollowing(profile.username)}
            className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="font-semibold text-fg tabular-nums">
              {formatCount(profile.counts.following)}
            </span>{" "}
            <span className="text-fg-subtle">{TERMS.following}</span>
          </Link>
          <span>
            <span className="font-semibold text-fg tabular-nums">
              {formatCount(profile.counts.waves)}
            </span>{" "}
            <span className="text-fg-subtle">{TERMS.waves}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
