"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui";
import { routes } from "@/config/routes";

import { TraceRow, type TraceRowWave } from "./TraceRow";

export interface HomeEmptyStateProps {
  /** Real Waves from Explore. The empty state is a working feed (§8.14). */
  waves: readonly TraceRowWave[];
}

/**
 * Home, empty (§8.14, §11.2).
 *
 * Left-aligned on the rail, never centred, never an icon inside a grey
 * circle, never an illustration (§12.5). The rule is that an empty state
 * should contain the thing it is describing: this one carries three real
 * Waves that play where they stand, so a reader with no follows still hears
 * the product in the first ten seconds.
 */
export function HomeEmptyState({ waves }: HomeEmptyStateProps) {
  const t = useTranslations("HomeEmptyState");
  const tTerms = useTranslations("Terms");
  return (
    <section className="akinti-page flex flex-col gap-8 pb-10">
      <div className="flex flex-col gap-3">
        <p className="type-heading measure text-ink">{t("noFollowsYet")}</p>
        <p className="type-body-sm measure text-ink-muted">{t("hereIsWhatPeopleListenTo")}</p>
      </div>

      {waves.length > 0 ? (
        <div className="flex flex-col">
          {waves.map((wave) => (
            <TraceRow key={wave.id} wave={wave} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3" aria-hidden="true">
          <Skeleton shape="waterline" />
          <Skeleton shape="waterline" />
        </div>
      )}

      <div className="flex flex-col items-start gap-4">
        <Link
          href={routes.explore()}
          className="akinti-press inline-flex h-11 items-center rounded-key border border-hairline-strong px-5 type-subhead text-ink transition-colors hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
        >
          {t("findPeopleToFollow")}
        </Link>
        <Link
          href={routes.create()}
          className="type-body-sm text-ink underline decoration-hairline-strong underline-offset-[3px] hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
        >
          {t("recordYourFirst", { wave: tTerms("wave") })}
        </Link>
      </div>
    </section>
  );
}
