import type { ReactNode } from "react";

import { cn } from "@/lib/ui";

export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Trailing controls, e.g. a filter menu or a primary action. */
  actions?: ReactNode;
  /** Tabs or filter chips pinned under the title. */
  below?: ReactNode;
  /** Renders the title for screen readers only, e.g. when the TopBar shows it. */
  hideTitle?: boolean;
  className?: string;
}

/** The `<h1>` and surrounding chrome for a route inside the app shell. */
export function PageHeader({
  title,
  description,
  actions,
  below,
  hideTitle = false,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3 px-4 pt-4 pb-3 sm:px-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className={cn("min-w-0", hideTitle && "sr-only")}>
          <h1 className="truncate text-xl font-semibold tracking-tight text-fg">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-fg-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {below}
    </div>
  );
}
