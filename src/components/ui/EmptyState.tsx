import type { ReactNode } from "react";

import { cn } from "@/lib/ui";

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** Usually a lucide icon; rendered in a quiet circular well. */
  icon?: ReactNode;
  /** Primary call to action. */
  action?: ReactNode;
  /** Secondary call to action, e.g. "Browse Explore". */
  secondaryAction?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}

/**
 * The state a surface shows when it has nothing to show yet. Every list,
 * feed and tab in the product needs one (spec section 38).
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  secondaryAction,
  size = "md",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "md" ? "gap-4 px-6 py-14" : "gap-3 px-4 py-8",
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-surface-muted text-fg-subtle",
            size === "md" ? "size-14" : "size-11",
          )}
        >
          {icon}
        </span>
      ) : null}
      <div className="max-w-sm space-y-1.5">
        <h2 className={cn("font-semibold text-fg", size === "md" ? "text-base" : "text-sm")}>
          {title}
        </h2>
        {description ? (
          <p className="text-sm leading-relaxed text-fg-muted">{description}</p>
        ) : null}
      </div>
      {action || secondaryAction ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
