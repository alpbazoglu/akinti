import { getTranslations } from "next-intl/server";

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
/**
 * Underbar tabs (SCREENS.md §12), not a pill segmented control: the active
 * range is a 2px ink underline, never a filled/rounded background (§12.4).
 * Kept as one `<form>` per option — same no-JS-required design as before —
 * so the switcher still works with JavaScript disabled.
 */
export async function RangeSwitcher({ current, section, className }: RangeSwitcherProps) {
  const t = await getTranslations("RangeSwitcher");

  return (
    <div role="group" aria-label={t("dateRangeLabel")} className={cn("flex items-center gap-5", className)}>
      {ANALYTICS_RANGE_OPTIONS.map((option) => {
        const selected = option.value === current;
        return (
          <form key={option.value} action={setAnalyticsRange.bind(null, section, option.value)}>
            <button
              type="submit"
              aria-current={selected || undefined}
              className={cn(
                "type-body-sm h-8 border-b-2 font-medium transition-colors duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                selected ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {t("days", { count: option.value })}
            </button>
          </form>
        );
      })}
    </div>
  );
}
