"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";

import { cn } from "@/lib/ui";

export interface ChipProps
  extends Omit<ComponentPropsWithRef<"button">, "children"> {
  children: ReactNode;
  /** Selected chips report `aria-pressed`. */
  selected?: boolean;
  icon?: ReactNode;
  count?: number;
}

/**
 * A toggleable filter pill, e.g. the Explore categories
 * (Trending, New, Rising, Open for Duet).
 */
export function Chip({
  children,
  selected = false,
  icon,
  count,
  className,
  type = "button",
  ...props
}: ChipProps) {
  return (
    <button
      {...props}
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3",
        "text-[0.8125rem] font-medium whitespace-nowrap transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:cursor-not-allowed disabled:opacity-55",
        selected
          ? "border-accent bg-accent-soft text-accent-soft-fg"
          : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg",
        className,
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="inline-flex">
          {icon}
        </span>
      ) : null}
      {children}
      {typeof count === "number" ? (
        <span className="text-fg-subtle tabular-nums">{count}</span>
      ) : null}
    </button>
  );
}
