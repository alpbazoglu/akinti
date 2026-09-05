"use client";

import { WaveformCanvas } from "@/components/audio";
import { cn } from "@/lib/ui";

export interface WaveSeparatorProps {
  /** The ending Wave's own peaks. The separator is made of that Wave. */
  peaks: readonly number[];
  className?: string;
}

/**
 * The waterline separator (§1, §5.2 divider_style, §8.3).
 *
 * A stream never uses a plain rule. One Wave is divided from the next by a 2px
 * amplitude trace drawn from the *ending* item's own peak data, at 24% ink —
 * which is the whole idea of this design system stated in one element: the
 * separator is the audio.
 *
 * A settings list uses a hairline instead; the two are never swapped.
 */
export function WaveSeparator({ peaks, className }: WaveSeparatorProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("akinti-edge-fade w-full opacity-24", className)}
    >
      <WaveformCanvas peaks={peaks} height={4} state="unplayed" />
    </div>
  );
}
