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

import { DUET_MODE_DESCRIPTION, DUET_MODE_LABEL } from "@/config/terminology";
import { cn } from "@/lib/ui";
import type { DuetMode } from "@/types/domain";

export interface DuetModePickerProps {
  value: DuetMode;
  onChange: (mode: DuetMode) => void;
  /** Modes to offer. Defaults to all three — a chain deep enough to be at the cypher cap can omit `cypher`. */
  modes?: readonly DuetMode[];
  className?: string;
}

const ALL_MODES: readonly DuetMode[] = ["layer", "atisma", "cypher"];

export function DuetModePicker({ value, onChange, modes = ALL_MODES, className }: DuetModePickerProps) {
  return (
    <div className={cn("flex flex-col", className)} role="radiogroup" aria-label="Duet mode">
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
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-1 size-3.5 shrink-0 rounded-full border",
                selected ? "border-ink bg-ink" : "border-hairline-strong bg-transparent",
              )}
            />
            <span className="flex flex-col gap-0.5">
              <span className="type-subhead text-ink">{DUET_MODE_LABEL[mode]}</span>
              <span className="type-body-sm text-ink-muted">{DUET_MODE_DESCRIPTION[mode]}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
