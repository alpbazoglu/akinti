import type { ReactNode } from "react";

import { cn } from "@/lib/ui";

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** Primary call to action. */
  action?: ReactNode;
  /** Secondary call to action, e.g. "Browse Explore". */
  secondaryAction?: ReactNode;
  /**
   * Real content that belongs in this space: a live strip of Waves, a dormant
   * tick row, a composer. An empty state should contain the thing it is
   * describing wherever that is possible (§8.14).
   */
  children?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}

/**
 * The state a surface shows when it has nothing to show yet (§8.14).
 *
 * Left-aligned on the rail. Never centred, never an icon inside a grey circle
 * above centred text, never an illustration — that pattern is the single most
 * recognisable generated-UI empty state there is (§12.5). There is no `icon`
 * prop, deliberately.
 */
export function EmptyState({
  title,
  description,
  action,
  secondaryAction,
  children,
  size = "md",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start text-left",
        size === "md" ? "gap-5 py-10" : "gap-4 py-6",
        className,
      )}
    >
      <div className="flex flex-col gap-2">
        <h2 className={cn("text-ink", size === "md" ? "type-heading" : "type-subhead")}>
          {title}
        </h2>
        {description ? (
          <p className="type-body-sm measure text-ink-muted">{description}</p>
        ) : null}
      </div>
      {children ? <div className="w-full">{children}</div> : null}
      {action || secondaryAction ? (
        <div className="flex flex-wrap items-center gap-4">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
