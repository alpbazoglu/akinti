/**
 * Formatters specific to the analytics surfaces. `formatCount`/`formatDuration`
 * (`@/lib/ui/format`) already cover raw counts and mm:ss durations elsewhere
 * in the app — these three are analytics-only shapes: a 0–1 rate, a
 * fractional ratio, and an average listen time that must show an honest
 * "no data yet" rather than "0:00" when nothing has been measured.
 */

import { formatDuration } from "@/lib/ui";

function isFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * A 0–1 rate as a percentage, e.g. `formatPercent(0.1234)` -> `"12.3%"`.
 * Clamped to `[0, 1]` — every rate this app computes is a proportion, so a
 * value outside that range indicates an upstream bug, not a real percentage
 * to display; clamping keeps the UI from showing something like "140%".
 */
export function formatPercent(value: number, fractionDigits = 1): string {
  if (!isFiniteNumber(value)) {
    return "0%";
  }
  const clamped = Math.min(1, Math.max(0, value));
  return `${(clamped * 100).toFixed(fractionDigits)}%`;
}

/** A plain ratio (not a percentage), e.g. Duet Requests per active user: `formatRatio(0.42)` -> `"0.42"`. */
export function formatRatio(value: number, fractionDigits = 2): string {
  if (!isFiniteNumber(value) || value < 0) {
    return (0).toFixed(fractionDigits);
  }
  return value.toFixed(fractionDigits);
}

/** `avg_listen_seconds` is `null` when there were no qualifying listens to average — show that honestly, never a fake "0:00". */
export function formatAvgListenTime(seconds: number | null): string {
  if (seconds === null || !isFiniteNumber(seconds) || seconds < 0) {
    return "No data yet";
  }
  return formatDuration(seconds);
}
