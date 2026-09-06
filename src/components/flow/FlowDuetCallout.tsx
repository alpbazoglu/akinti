"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Avatar } from "@/components/ui";
import { ArrowRight, Handshake } from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { formatCount } from "@/lib/ui";

import type { FlowWave } from "./types";

export interface FlowDuetCalloutProps {
  wave: FlowWave;
  onRequestDuet: () => void;
}

/**
 * The right rail's Duet section (`DESIGN_V3_DESKTOP.md` Flow: "the Duet
 * chain"). The full chain tree (`DuetChain`, `src/app/(app)/w/[id]/page.tsx`)
 * needs `get_duet_tree`, which Flow's own hydration (`hydrateFlow.ts`) does
 * not fetch for every card in a session-seeded stream — adding it here would
 * mean a chain-tree query per Wave the reader merely scrolls past. Instead
 * this mirrors `mock-A.html`'s "open for duet" callout with the lineage data
 * Flow already has (mode, Duet count, the open-for-Duet mark) and links
 * through to the Wave's own page for the full tree — same "See all" pattern
 * every other rail section in this pass uses.
 */
export function FlowDuetCallout({ wave, onRequestDuet }: FlowDuetCalloutProps) {
  const t = useTranslations("Flow");
  const tTerms = useTranslations("Terms");
  const name = wave.creator.displayName ?? wave.creator.username;
  const openForDuet = wave.canRequestDuet;

  return (
    <section aria-labelledby="flow-duet" className="flex flex-col gap-3">
      <h2 id="flow-duet" className="type-caption-strong text-ink-subtle">
        {openForDuet ? t("openForDuetHeading") : t("duetHeading", { duet: tTerms("duet") })}
      </h2>

      <div className="flex flex-col gap-3 rounded-card border border-hairline bg-elevation-2 p-4">
        <div className="flex items-center gap-2.5">
          <Avatar name={name} src={wave.creator.avatarUrl} size="sm" />
          <span className="type-body-sm min-w-0 truncate font-medium text-ink">{name}</span>
        </div>

        {openForDuet ? (
          <p className="type-body-sm text-ink-muted">{t("openForDuetBody", { title: wave.title })}</p>
        ) : wave.metrics.duets > 0 ? (
          <p className="type-body-sm text-ink-muted">
            {t("duetChainCount", { count: formatCount(wave.metrics.duets), duets: tTerms("duets") })}
          </p>
        ) : (
          <p className="type-body-sm text-ink-subtle">{t("noDuetsYet")}</p>
        )}

        {openForDuet ? (
          <button
            type="button"
            onClick={onRequestDuet}
            className="akinti-press flex h-10 items-center justify-center gap-2 rounded-key bg-tide type-body-sm font-medium text-on-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
          >
            <Handshake className="size-4" weight="fill" />
            {t("sendTheRequest")}
          </button>
        ) : (
          <Link
            href={routes.wave(wave.id)}
            className="akinti-press flex h-9 items-center justify-center gap-1.5 rounded-key border border-hairline-strong type-caption font-medium text-ink-muted transition-colors hover:bg-elevation-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
          >
            {t("viewFullChain")}
            <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
    </section>
  );
}
