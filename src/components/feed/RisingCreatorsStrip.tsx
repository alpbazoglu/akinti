"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { WaveformCanvas } from "@/components/audio";
import { FollowButton } from "@/components/profile";
import { Avatar, Skeleton } from "@/components/ui";
import { routes } from "@/config/routes";
import type { FollowStatus, Profile } from "@/types/domain";

import { deriveGenreHue } from "./genreHue";

export interface RisingCreator {
  profile: Profile;
  followStatus: FollowStatus | null;
  followsViewer: boolean;
  /**
   * The creator's signature, composed from their recent Waves (§10). Empty
   * when they have not published audio yet: the tile then draws the dormant
   * tick row rather than inventing a shape (§6.2).
   */
  signature?: readonly number[];
  /**
   * Tags from the same Waves the signature was composed from, one array per
   * Wave (newest first). Used to derive a genre tint for the tile's trace
   * (`docs/design/COLOR_V2.md` "Colour by mode and genre") via
   * `deriveGenreHue`; omitted or all-empty draws the plain current instead.
   */
  waveTags?: readonly (readonly string[])[];
}

export interface RisingCreatorsStripProps {
  creators: readonly RisingCreator[];
  isSignedIn: boolean;
}

/**
 * "Voices worth following" (SCREENS.md §3).
 *
 * The creator tile is the one place a card exists in this product, because a
 * horizontal rail genuinely needs a bounded object (§12.1). It is a 16px
 * hairline tile with no fill and no shadow: the boundary is the line, not
 * elevation (§5.3).
 *
 * The artwork is the creator's own signature trace, so the tile carries real
 * audio rather than a stock banner or a generated gradient (§10, §12.27).
 * The trace tints toward the creator's dominant genre when `waveTags` is
 * supplied (`docs/design/COLOR_V2.md` "Colour by mode and genre"); omit it
 * and the trace draws in the plain current, as it always has.
 */
export function RisingCreatorsStrip({ creators, isSignedIn }: RisingCreatorsStripProps) {
  const t = useTranslations("RisingCreatorsStrip");
  if (creators.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="rising-creators" className="flex flex-col gap-4 pt-6">
      <h2 id="rising-creators" className="akinti-page type-caption-strong text-ink-muted">
        {t("title")}
      </h2>

      <ul className="akinti-page flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
        {creators.map(({ profile, followStatus, followsViewer, signature, waveTags }) => {
          const name = profile.displayName ?? profile.username;
          const hue = waveTags ? deriveGenreHue(waveTags) : undefined;
          return (
            <li
              key={profile.id}
              className="flex w-32 shrink-0 snap-start flex-col gap-3 rounded-object border border-hairline p-3"
            >
              <div aria-hidden="true" className="h-10">
                {signature && signature.length > 0 ? (
                  <WaveformCanvas peaks={signature} height={40} state="unplayed" hue={hue} />
                ) : (
                  <div className="flex h-10 items-center">
                    <Skeleton shape="waterline" />
                  </div>
                )}
              </div>

              <Link
                href={routes.profile(profile.username)}
                className="flex min-w-0 flex-col gap-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
              >
                <Avatar name={name} src={profile.avatarUrl} size="sm" />
                <span className="type-subhead truncate text-ink">{name}</span>
                <span className="type-caption truncate text-ink-subtle">@{profile.username}</span>
              </Link>

              <FollowButton
                profileId={profile.id}
                initialFollowStatus={followStatus}
                isSignedIn={isSignedIn}
                followsViewer={followsViewer}
                size="xs"
                hideIcon
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
