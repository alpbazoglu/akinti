import type { ReactNode } from "react";

import { cn } from "@/lib/ui";

export interface PageHeaderProps {
  title: string;
  /** Trailing controls, e.g. a filter menu or a secondary key. */
  actions?: ReactNode;
  /** Tabs or the filter row, pinned under the title. */
  below?: ReactNode;
  /** Renders the title for screen readers only. */
  hideTitle?: boolean;
  className?: string;
}

/**
 * The page title (§8.2).
 *
 * A 32px `display` heading that lives in the content and scrolls away, not a
 * bar. There is deliberately no `description`: a title-plus-subtitle block
 * stamped on every screen is the pattern DESIGN.md names and deletes (§12.9),
 * and the audit found it carrying engineering copy on Search and Analytics.
 * Where a screen genuinely needs a sentence, that sentence belongs next to the
 * thing it explains, not under the title.
 */
export function PageHeader({
  title,
  actions,
  below,
  hideTitle = false,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("akinti-page flex flex-col gap-5 pt-6 pb-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <h1 className={cn("type-display min-w-0 text-ink", hideTitle && "sr-only")}>
          {title}
        </h1>
        {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
      </div>
      {below}
    </div>
  );
}
