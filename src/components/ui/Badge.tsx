import type { ReactNode } from "react";

import { cn } from "@/lib/ui";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";
export type BadgeSize = "sm" | "md";

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  size?: BadgeSize;
  /** Small decorative glyph or icon shown before the label. */
  icon?: ReactNode;
  className?: string;
}

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-muted text-fg-muted",
  accent: "bg-accent-soft text-accent-soft-fg",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger-soft-fg",
};

const SIZES: Record<BadgeSize, string> = {
  sm: "h-5 gap-1 px-2 text-[0.6875rem]",
  md: "h-6 gap-1.5 px-2.5 text-xs",
};

export function Badge({
  children,
  tone = "neutral",
  size = "sm",
  icon,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium whitespace-nowrap",
        TONES[tone],
        SIZES[size],
        className,
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="inline-flex leading-none">
          {icon}
        </span>
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

/** Small numeric indicator, e.g. the unread badge on the Messages icon. */
export function CountBadge({ count, label, max = 99, className }: CountBadgeProps) {
  if (count <= 0) return null;
  const display = count > max ? `${max}+` : String(count);

  return (
    <span
      className={cn(
        "inline-flex min-w-4 items-center justify-center rounded-full bg-accent px-1",
        "text-[0.625rem] leading-4 font-semibold text-fg-on-accent",
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
