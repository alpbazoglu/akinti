import Link from "next/link";

import { Avatar } from "@/components/ui";
import { FollowButton } from "@/components/profile";
import { routes } from "@/config/routes";
import { EXPLORE_CATEGORY_META } from "@/lib/feed";
import type { FollowStatus, Profile } from "@/types/domain";

export interface RisingCreator {
  profile: Profile;
  followStatus: FollowStatus | null;
  followsViewer: boolean;
}

export interface RisingCreatorsStripProps {
  creators: readonly RisingCreator[];
  isSignedIn: boolean;
}

/**
 * Explore's "Rising creators" strip (spec s10): creators with recent
 * follower growth or a recent first Wave, with an inline Follow button
 * reusing the existing `FollowButton` (never re-implemented here). Distinct
 * from the "Rising" category tab below, which lists *Waves* from this same
 * signal — see `EXPLORE_CATEGORY_META.rising`.
 */
export function RisingCreatorsStrip({ creators, isSignedIn }: RisingCreatorsStripProps) {
  if (creators.length === 0) {
    return null;
  }

  return (
    <section aria-label={EXPLORE_CATEGORY_META.rising.label} className="flex flex-col gap-2 px-4 pt-4 sm:px-5">
      <h2 className="text-sm font-semibold text-fg">Rising creators</h2>
      <ul className="flex gap-3 overflow-x-auto pb-2">
        {creators.map(({ profile, followStatus, followsViewer }) => (
          <li
            key={profile.id}
            className="flex w-28 shrink-0 flex-col items-center gap-2 rounded-xl border border-border bg-surface p-3 text-center"
          >
            <Link href={routes.profile(profile.username)} className="flex flex-col items-center gap-1.5">
              <Avatar name={profile.displayName ?? profile.username} src={profile.avatarUrl} size="lg" />
              <span className="w-full truncate text-xs font-medium text-fg">
                {profile.displayName ?? profile.username}
              </span>
              <span className="w-full truncate text-[0.6875rem] text-fg-subtle">@{profile.username}</span>
            </Link>
            <FollowButton
              profileId={profile.id}
              initialFollowStatus={followStatus}
              isSignedIn={isSignedIn}
              followsViewer={followsViewer}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
