"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { COUNTDOWN_SECONDS } from "@/lib/audio";
import { cn } from "@/lib/ui";

export interface CountdownProps {
  /** Called once, when the last tick goes out. */
  onComplete: () => void;
  /** Seconds to count. Defaults to the three `mobile-guidelines.md` rule 15 asks for. */
  seconds?: number;
  className?: string;
}

/**
 * The count-in (`docs/design/DESIGN.md` §8.5, `mobile-guidelines.md` rule 15).
 *
 * Three shrinking ink ticks, not bouncing numerals: §8.5 is explicit, and a
 * numeral that scales up and fades is the single most generic animation in
 * this category. Each tick goes out on the beat, so the last one leaving *is*
 * the downbeat.
 *
 * The numbers still exist for anyone who needs them — an `aria-live` region
 * announces "3, 2, 1" for a screen reader, which is where a spoken count
 * belongs rather than on the screen.
 *
 * Under `prefers-reduced-motion` nothing scales; the ticks simply go out
 * (§7.3: the state stays, the movement goes).
 */
export function Countdown({ onComplete, seconds = COUNTDOWN_SECONDS, className }: CountdownProps) {
  const t = useTranslations("Countdown");
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) {
      onComplete();
      return;
    }
    const timer = setTimeout(() => setRemaining((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining, onComplete]);

  return (
    <div className={cn("flex flex-col items-start gap-3", className)}>
      <span className="flex items-end gap-3" aria-hidden="true">
        {Array.from({ length: seconds }, (_, index) => {
          const out = index >= remaining;
          return (
            <span
              key={index}
              className={cn(
                "w-1 bg-ink transition-[height,opacity] duration-[--dur-normal] ease-[--ease-exit]",
                out ? "h-2 opacity-20" : "h-10 opacity-100",
              )}
            />
          );
        })}
      </span>
      <span role="status" aria-live="assertive" className="sr-only">
        {remaining > 0 ? t("startingIn", { remaining }) : t("recording")}
      </span>
      <p className="type-caption text-ink-subtle">{t("getReady")}</p>
    </div>
  );
}
