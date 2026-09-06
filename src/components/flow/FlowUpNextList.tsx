"use client";

import { useTranslations } from "next-intl";

import { genreHueForTag } from "@/components/feed";
import { WaveformCanvas } from "@/components/audio";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/ui";

import { flowTraceHue, type FlowWave } from "./types";

export interface FlowUpNextListProps {
  items: readonly FlowWave[];
  onSelect: (waveId: string) => void;
}

/**
 * The right rail's "up next" list (`DESIGN_V3_DESKTOP.md` Flow: "right rail
 * ... with 'Up next' list (3 items with mini traces)"), styled after the
 * queue rows in `docs/research/desktop/mock-A.html`'s `.rrail`. Each row is
 * a real jump, not a preview — clicking one calls `FlowScreen.goToIndex`
 * through `onSelect`, same as clicking a Wave anywhere else in the product.
 */
export function FlowUpNextList({ items, onSelect }: FlowUpNextListProps) {
  const t = useTranslations("Flow");

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="flow-up-next">
      <h2 id="flow-up-next" className="type-caption-strong pb-3 text-ink-subtle">
        {t("upNextHeading")}
      </h2>
      <ul className="flex flex-col gap-1">
        {items.map((wave) => {
          const name = wave.creator.displayName ?? wave.creator.username;
          const hue = flowTraceHue(wave, genreHueForTag);
          return (
            <li key={wave.id}>
              <button
                type="button"
                onClick={() => onSelect(wave.id)}
                className={cn(
                  "akinti-press group flex w-full items-center gap-3 rounded-key p-2 text-left transition-colors duration-100",
                  "hover:bg-elevation-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-tide",
                )}
              >
                <Avatar name={name} src={wave.creator.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="type-body-sm block truncate text-ink">{wave.title}</span>
                  <span className="type-caption block truncate text-ink-subtle">{name}</span>
                </span>
                <span className="h-6 w-14 shrink-0 opacity-70 group-hover:opacity-100">
                  <WaveformCanvas peaks={wave.peaks} state="unplayed" height={24} hue={hue} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
