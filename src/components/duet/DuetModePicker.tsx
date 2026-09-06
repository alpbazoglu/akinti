"use client";

/**
 * Mode picker for the Duet record flow (`docs/DUET_SPEC.md` "Duet modes",
 * spec item 1: "mode picker (Layer / Atışma / Cypher) with one-sentence
 * explanations"). Presentation only — `DuetRecorder.tsx` owns the state this
 * writes into and decides which capture flow to mount next.
 *
 * Three rail rows, not three pills or three cards (`docs/design/DESIGN.md`
 * §12 rules 1 and 4): each row is a real radio, so the whole row is the
 * touch target and the choice reads correctly to a screen reader.
 */

import { useTranslations } from "next-intl";

import { Queue, Repeat, Shuffle } from "@/components/ui/icons";
import { DUET_MODE_LABEL } from "@/config/terminology";
import { cn } from "@/lib/ui";
import type { DuetMode } from "@/types/domain";
import type { IconComponent } from "@/components/ui/icons";

/**
 * Translated one-sentence explanations for each mode. Deliberately not
 * `DUET_MODE_DESCRIPTION` (`@/config/terminology`, English-only, §4 of
 * `docs/I18N.md`) — this is the display-only translated parallel.
 */
const MODE_DESCRIPTION_KEY = {
  layer: "descriptionLayer",
  atisma: "descriptionAtisma",
  cypher: "descriptionCypher",
} as const satisfies Record<DuetMode, string>;

/**
 * Desktop cards (this pass's brief, item 3: "mode picker as three cards with
 * icons") — a stack for Layer (recording alongside the original at once), a
 * back-and-forth swap for Atışma (trading turns), a loop for Cypher (adding
 * a verse after everyone who already has). Drawn from the existing approved
 * Phosphor set (`src/components/ui/icons.ts`, not owned by this pass) rather
 * than a new glyph.
 */
const MODE_ICON = {
  layer: Queue,
  atisma: Shuffle,
  cypher: Repeat,
} as const satisfies Record<DuetMode, IconComponent>;

export interface DuetModePickerProps {
  value: DuetMode;
  onChange: (mode: DuetMode) => void;
  /** Modes to offer. Defaults to all three — a chain deep enough to be at the cypher cap can omit `cypher`. */
  modes?: readonly DuetMode[];
  className?: string;
}

const ALL_MODES: readonly DuetMode[] = ["layer", "atisma", "cypher"];

export function DuetModePicker({ value, onChange, modes = ALL_MODES, className }: DuetModePickerProps) {
  const t = useTranslations("DuetModePicker");
  return (
    <div className={className}>
      {/* Mobile: the original rail rows, unchanged. */}
      <div className="flex flex-col lg:hidden" role="radiogroup" aria-label={t("duetMode")}>
        {modes.map((mode) => {
          const selected = value === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(mode)}
              className={cn(
                "akinti-press flex w-full items-start gap-3 border-t border-hairline py-4 text-left last:border-b",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-tide",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1 size-3.5 shrink-0 rounded-full border",
                  selected ? "border-tide bg-tide" : "border-hairline-strong bg-transparent",
                )}
              />
              <span className="flex flex-col gap-0.5">
                <span className="type-subhead text-ink">{DUET_MODE_LABEL[mode]}</span>
                <span className="type-body-sm text-ink-muted">{t(MODE_DESCRIPTION_KEY[mode])}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Desktop: three cards with icons. */}
      <div
        className="hidden gap-4 lg:grid"
        style={{ gridTemplateColumns: `repeat(${modes.length}, minmax(0, 1fr))` }}
        role="radiogroup"
        aria-label={t("duetMode")}
      >
        {modes.map((mode) => {
          const selected = value === mode;
          const Icon = MODE_ICON[mode];
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(mode)}
              className={cn(
                "akinti-press flex flex-col items-start gap-3 rounded-card border p-5 text-left transition-colors duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide",
                selected ? "border-tide bg-elevation-2" : "border-hairline bg-elevation-2 hover:border-hairline-strong",
              )}
            >
              <Icon className={cn("size-6", selected ? "text-tide" : "text-ink-muted")} aria-hidden="true" />
              <span className="type-subhead text-ink">{DUET_MODE_LABEL[mode]}</span>
              <span className="type-body-sm text-ink-muted">{t(MODE_DESCRIPTION_KEY[mode])}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
