"use client";

import { useId, useState } from "react";

import { Select, type SelectOption } from "@/components/ui";
import { cn, formatCount } from "@/lib/ui";
import type { CreatorAnalyticsDay } from "@/types/domain";

type MetricKey = "plays" | "uniqueListeners" | "replays" | "saves" | "comments" | "shares" | "newFollowers";

const METRIC_LABELS: Record<MetricKey, string> = {
  plays: "Plays",
  uniqueListeners: "Unique listeners",
  replays: "Replays",
  saves: "Saves",
  comments: "Comments",
  shares: "Shares",
  newFollowers: "New followers",
};

const METRIC_OPTIONS: SelectOption[] = Object.entries(METRIC_LABELS).map(([value, label]) => ({
  value,
  label,
}));

function formatShortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export interface AnalyticsTimeseriesChartProps {
  /** Exactly the requested range's worth of days, already gap-filled — see `fillAnalyticsTimeseriesGaps`. */
  days: readonly CreatorAnalyticsDay[];
  className?: string;
}

/**
 * A single-metric daily bar chart, built from small inline `<rect>`s (no
 * charting library, spec §13/§27/§40 own the numbers — this only draws
 * them). One metric at a time by design: seven series with very different
 * scales (Plays vs. Comments) on one axis would misrepresent every one of
 * them, so a `<select>` swaps the series instead of overlaying them.
 * `showTable` gives every value as real `<table>` markup for anyone who
 * can't or doesn't want to read the chart (spec §29) — full keyboard access
 * via the toggle button, not a mouse-only affordance.
 */
export function AnalyticsTimeseriesChart({ days, className }: AnalyticsTimeseriesChartProps) {
  const [metric, setMetric] = useState<MetricKey>("plays");
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();

  const values = days.map((day) => day[metric]);
  const max = Math.max(1, ...values);
  const barUnit = 12;
  const barCount = Math.max(days.length, 1);

  const rangeLabel =
    days.length > 0 ? `${formatShortDate(days[0]!.day)} – ${formatShortDate(days[days.length - 1]!.day)}` : "";

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id={titleId} className="type-caption font-semibold text-ink-muted">
            Daily {METRIC_LABELS[metric].toLowerCase()}
          </h3>
          {rangeLabel ? <p className="type-caption text-ink-subtle">{rangeLabel}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <Select
            id="analytics-chart-metric"
            label="Chart metric"
            hideLabel
            value={metric}
            onChange={(event) => setMetric(event.target.value as MetricKey)}
            options={METRIC_OPTIONS}
            containerClassName="w-44"
          />
          <button
            type="button"
            onClick={() => setShowTable((value) => !value)}
            aria-pressed={showTable}
            className="akinti-press type-caption h-10 shrink-0 text-ink-muted underline decoration-hairline-strong decoration-1 underline-offset-[3px] hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {showTable ? "Show chart" : "Show table"}
          </button>
        </div>
      </div>

      {showTable ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left text-xs">
            <caption className="sr-only">Daily {METRIC_LABELS[metric].toLowerCase()}</caption>
            <thead>
              <tr className="border-b border-border text-fg-subtle">
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Date
                </th>
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  {METRIC_LABELS[metric]}
                </th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.day} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5 pr-3 text-fg-muted">{formatShortDate(day.day)}</td>
                  <td className="py-1.5 pr-3 tabular-nums text-fg">{formatCount(day[metric])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          role="img"
          aria-labelledby={titleId}
          viewBox={`0 0 ${barCount * barUnit} 120`}
          preserveAspectRatio="none"
          className="mt-4 h-28 w-full overflow-visible"
        >
          {days.map((day, index) => {
            const value = day[metric];
            const barHeight = value > 0 ? Math.max(4, Math.round((value / max) * 112)) : 1;
            return (
              <rect
                key={day.day}
                x={index * barUnit + 2}
                y={120 - barHeight}
                width={barUnit - 4}
                height={barHeight}
                rx={2}
                className={value > 0 ? "fill-accent" : "fill-surface-inset"}
              >
                <title>{`${formatShortDate(day.day)}: ${formatCount(value)} ${METRIC_LABELS[metric].toLowerCase()}`}</title>
              </rect>
            );
          })}
        </svg>
      )}
    </div>
  );
}
