import { setAnalyticsRange } from "@/app/(app)/analytics/actions";
import { ANALYTICS_RANGE_OPTIONS } from "@/lib/analytics/range";
import { cn } from "@/lib/ui";
import type { AnalyticsRangeDays } from "@/types/domain";

export interface RangeSwitcherProps {
  current: AnalyticsRangeDays;
  section: "creator" | "health";
  className?: string;
}

/**
 * 7 / 30 / 90-day range switcher. Each option is its own `<form>` bound to
 * `setAnalyticsRange` (`src/app/(app)/analytics/actions.ts`) — a plain
 * server-rendered component, no client JS needed to change the range.
 */
export function RangeSwitcher({ current, section, className }: RangeSwitcherProps) {
  return (
    <div
      role="group"
      aria-label="Date range"
      className={cn("inline-flex items-center gap-1 rounded-full bg-surface-muted p-1", className)}
    >
      {ANALYTICS_RANGE_OPTIONS.map((option) => {
        const selected = option.value === current;
        return (
          <form key={option.value} action={setAnalyticsRange.bind(null, section, option.value)}>
            <button
              type="submit"
              aria-current={selected || undefined}
              className={cn(
                "h-8 rounded-full px-3.5 text-sm font-medium transition-colors duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                selected ? "bg-surface text-fg shadow-xs" : "text-fg-muted hover:text-fg",
              )}
            >
              {option.label}
            </button>
          </form>
        );
      })}
    </div>
  );
}
