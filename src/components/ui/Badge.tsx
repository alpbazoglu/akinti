import type { ReactNode } from "react";

import { cn } from "@/lib/ui";

/**
 * `neutral` is the whole system: a hairline tag in ink (§8.11). `signal` exists
 * for the two marks that genuinely describe live audio — unheard audio and
 * "open for Duet" — and is drawn as a Signal dot beside an ink label, never as
 * a Signal fill carrying text (§4.4).
 */
export type BadgeTone = "neutral" | "signal";
export type BadgeSize = "sm" | "md";

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  size?: BadgeSize;
  className?: string;
}

/**
 * Recorded / Uploaded / Duet and every other tag in the product (§8.11):
 * a 2px-radius hairline tag, ink only, sentence case, 11px, 6px of horizontal
 * padding, 20px tall. Never filled, never tinted, never a pill, never
 * full-bleed across a row.
 */
export function Badge({ children, tone = "neutral", size = "sm", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-label border border-hairline-strong",
        "type-micro text-ink whitespace-nowrap",
        size === "sm" ? "h-5 px-1.5" : "h-6 px-2",
        className,
      )}
    >
      {tone === "signal" ? (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-signal" />
      ) : null}
      {children}
    </span>
  );
}

export interface CountBadgeProps {
  count: number;
  /** Describes what the count refers to, e.g. "unread messages". */
  label: string;
  max?: number;
  className?: string;
}

/**
 * Small numeric indicator, e.g. the unread mark on Messages. An ink field with
 * a paper numeral in the tabular mono, at label radius — never a coloured dot,
 * because a coloured dot here would be Signal outside audio state (§12.3).
 */
export function CountBadge({ count, label, max = 99, className }: CountBadgeProps) {
  if (count <= 0) return null;
  const display = count > max ? `${max}+` : String(count);

  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-label bg-ink px-1",
        "type-mono-sm text-on-ink",
        className,
      )}
    >
      <span aria-hidden="true">{display}</span>
      <span className="sr-only">
        {count} {label}
      </span>
    </span>
  );
}
