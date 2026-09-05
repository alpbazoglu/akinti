"use client";

import type { ComponentPropsWithRef } from "react";

import { cn } from "@/lib/ui";

/**
 * Sizes and their curvature (§8.5). Every record key shares one corner
 * *curvature*, `0.295 x side`, not one corner radius, so a 72px stop key and a
 * 96px onboarding key read as the same object at two sizes.
 */
export type RecordKeySize = 36 | 44 | 72 | 88 | 96;

export type RecordKeyState = "idle" | "armed" | "recording" | "paused";

export interface RecordKeyProps
  extends Omit<ComponentPropsWithRef<"button">, "children"> {
  /** Names the control. Required: this is the most important object here. */
  label: string;
  size?: RecordKeySize;
  state?: RecordKeyState;
}

// Radii reference the `--akinti-radius-key-*` custom properties (`globals.css`)
// rather than restating their pixel values, so a future token edit can't
// silently desync the record key from the rest of the curvature ladder.
const GEOMETRY: Record<RecordKeySize, { key: string; radius: string; lamp: string }> = {
  36: { key: "size-9", radius: "rounded-[var(--akinti-radius-key-36)]", lamp: "size-2.5" },
  44: { key: "size-11", radius: "rounded-[var(--akinti-radius-key-44)]", lamp: "size-3.5" },
  72: { key: "size-18", radius: "rounded-[var(--akinti-radius-key-72)]", lamp: "size-4" },
  88: { key: "size-22", radius: "rounded-[var(--akinti-radius-key-88)]", lamp: "size-5" },
  96: { key: "size-24", radius: "rounded-[var(--akinti-radius-key-96)]", lamp: "size-5" },
};

/**
 * The record key (§8.5).
 *
 *   idle       ink field, Signal dot centred
 *   armed      ink field, Signal dot, plus a 1px Signal ring on the key
 *   recording  Signal field, ink square centred
 *   paused     Signal field, ink square, not breathing
 *
 * **The lamp is the dot, not the key.** On a TP-7 or a Nagra the record
 * control is neutral and the *lamp* is red; filling the whole key red at rest
 * is what a consumer app does. That makes the inversion on recording a genuine
 * event rather than a hover state.
 *
 * The dot breathing between 100% and 55% over 1400ms is the only infinite
 * animation in the entire product (§7.2), and under `prefers-reduced-motion` it
 * becomes a static filled Signal dot rather than disappearing (§7.3).
 */
export function RecordKey({
  label,
  size = 88,
  state = "idle",
  className,
  type = "button",
  ...props
}: RecordKeyProps) {
  const geometry = GEOMETRY[size];
  const live = state === "recording" || state === "paused";

  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      aria-pressed={live}
      className={cn(
        "akinti-press inline-flex shrink-0 items-center justify-center",
        "transition-colors duration-[--dur-micro]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        geometry.key,
        geometry.radius,
        live ? "bg-signal" : "bg-ink",
        state === "armed" && "ring-1 ring-signal ring-offset-2 ring-offset-paper",
        className,
      )}
    >
      {live ? (
        // Recording inverts the key: an ink square, the universal stop mark.
        <span aria-hidden="true" className={cn("bg-ink", geometry.lamp)} />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "rounded-full bg-signal",
            state === "armed" && "motion-safe:akinti-lamp",
            geometry.lamp,
          )}
        />
      )}
    </button>
  );
}
