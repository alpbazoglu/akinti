import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { FollowButton } from "@/components/profile";
import { Avatar, Badge } from "@/components/ui";
import { CREATION_TYPES, type CreationType } from "@/config/terminology";
import { routes } from "@/config/routes";
import { formatAbsoluteTime } from "@/lib/ui";
import type { FollowStatus } from "@/types/domain";

export interface WaveCreatorCardProps {
  creator: {
    id: string;
    username: string;
    displayName?: string;
    avatarUrl?: string | null;
  };
  publishedAt: string;
  creationType: CreationType;
  isSignedIn: boolean;
  /** `null` when this is the viewer's own Wave — no Follow key on your own card. */
  followStatus: FollowStatus | null | "self";
  followsViewer: boolean;
}

/**
 * The right rail's creator card (`DESIGN_V3_DESKTOP.md` "Wave page ... right
 * rail with creator card, chain tree, OwnerInsights"). Carries the same
 * information `WaveDetail`'s inline creator row shows on mobile (hidden at
 * >= 1024px in favour of this), plus a Follow key the mobile row never had
 * room for.
 */
export async function WaveCreatorCard({
  creator,
  publishedAt,
  creationType,
  isSignedIn,
  followStatus,
  followsViewer,
}: WaveCreatorCardProps) {
  const t = await getTranslations("WaveCreatorCard");
  const tTerms = await getTranslations("Terms");
  const name = creator.displayName ?? creator.username;
  const meta = CREATION_TYPES[creationType];

  return (
    <section aria-labelledby="wave-creator-card" className="flex flex-col gap-4 rounded-card border border-hairline bg-elevation-2 p-4">
      <h2 id="wave-creator-card" className="sr-only">
        {t("heading")}
      </h2>

      <Link
        href={routes.profile(creator.username)}
        className="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
      >
        <Avatar name={name} src={creator.avatarUrl} size="lg" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="type-subhead truncate text-ink">{name}</span>
          <span className="type-caption truncate text-ink-subtle">@{creator.username}</span>
        </div>
      </Link>

      <p className="type-caption flex items-center gap-2 text-ink-subtle">
        <time dateTime={publishedAt}>{formatAbsoluteTime(publishedAt)}</time>
        <Badge>{tTerms(meta.id)}</Badge>
      </p>

      {followStatus === "self" ? null : (
        <FollowButton
          profileId={creator.id}
          initialFollowStatus={followStatus}
          isSignedIn={isSignedIn}
          followsViewer={followsViewer}
          size="sm"
        />
      )}
    </section>
  );
}
