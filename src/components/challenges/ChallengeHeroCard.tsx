import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Clock, Users } from "@/components/ui/icons";
import { routes } from "@/config/routes";

import { ChallengeBackingTrack } from "./ChallengeBackingTrack";

export interface ChallengeHeroCardBackingTrack {
  readonly audioAssetId: string;
  readonly title: string;
  readonly artistCredit: string;
  readonly durationMs: number | null;
}

export interface ChallengeHeroCardProps {
  slug: string;
  title: string;
  brief: string;
  /** Whole days until `endsAt`, computed by the caller (`daysUntil` in `challenges/page.tsx`) rather than in this render body — `Date.now()` is an impure call the React Compiler rule flags when it runs directly inside a component's render. */
  daysLeft: number;
  /**
   * Real entries found for this challenge, capped by the page's own fetch
   * limit (`MAX_PAGE_LIMIT`) — never a fabricated total. `capped` means more
   * exist past that page, rendered as "50+" rather than a fake exact count.
   */
  entryCount: number;
  entryCountCapped: boolean;
  backingTrack: ChallengeHeroCardBackingTrack | null;
  className?: string;
}

/**
 * A live challenge, as a card (this pass's brief, item 1: "live challenges as
 * hero cards with the backing-track play, deadline, entry count (never
 * zero), sand mark"). "Never zero": the entry-count line is simply omitted
 * when there are no entries yet, the same non-zero-metrics rule every count
 * in the product already follows (`WaveCard`'s `MetricsRow`) — never a
 * printed "0 entries". The live status dot is the current, and the backing
 * track's own play mark stays sand (`ChallengeBackingTrack`, reused
 * unmodified) — `docs/design/COLOR_V2.md` "Challenges": "the live challenge
 * mark in current; backing-track mark in sand."
 */
export async function ChallengeHeroCard({
  slug,
  title,
  brief,
  daysLeft,
  entryCount,
  entryCountCapped,
  backingTrack,
  className,
}: ChallengeHeroCardProps) {
  const t = await getTranslations("ChallengeHeroCard");
  const deadlineLabel = daysLeft <= 0 ? t("endsToday") : daysLeft === 1 ? t("endsTomorrow") : t("endsInDays", { days: daysLeft });
  const entryCountLabel = entryCountCapped
    ? t("entryCountPlus", { count: entryCount })
    : t("entryCount", { count: entryCount });

  return (
    <article
      className={
        className ??
        "group flex flex-col gap-4 rounded-card border border-hairline bg-elevation-2 p-5 transition-[transform,box-shadow,border-color] duration-150 ease-[--ease-enter] hover:-translate-y-1 hover:border-hairline-strong hover:shadow-lift"
      }
    >
      <Link
        href={routes.challenge(slug)}
        className="flex flex-col gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
      >
        <span className="flex items-center gap-1.5 type-caption-strong text-tide">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-tide" />
          {t("liveNow")}
        </span>
        <h3 className="type-heading text-ink group-hover:underline">{title}</h3>
        <p className="type-body-sm line-clamp-2 text-ink-muted">{brief}</p>
      </Link>

      {backingTrack ? (
        <ChallengeBackingTrack
          assetId={backingTrack.audioAssetId}
          title={backingTrack.title}
          artistCredit={backingTrack.artistCredit}
          durationMs={backingTrack.durationMs}
          className="-mx-1"
        />
      ) : null}

      <div className="flex items-center gap-4 type-caption text-ink-subtle">
        {entryCount > 0 ? (
          <span className="flex items-center gap-1.5">
            <Users className="size-4" aria-hidden="true" />
            {entryCountLabel}
          </span>
        ) : null}
        <span className="flex items-center gap-1.5">
          <Clock className="size-4" aria-hidden="true" />
          {deadlineLabel}
        </span>
      </div>
    </article>
  );
}
