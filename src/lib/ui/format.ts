/** Formatting helpers shared across the UI layer. */

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

/**
 * Format a duration in seconds as `m:ss`, or `h:mm:ss` past an hour.
 * Invalid, negative and non-finite input formats as `0:00`.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";

  const total = Math.floor(seconds);
  const hours = Math.floor(total / SECONDS_PER_HOUR);
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const secs = total % SECONDS_PER_MINUTE;
  const pad = (value: number) => value.toString().padStart(2, "0");

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

const COUNT_UNITS: readonly { readonly threshold: number; readonly suffix: string }[] = [
  { threshold: 1_000_000_000, suffix: "B" },
  { threshold: 1_000_000, suffix: "M" },
  { threshold: 1_000, suffix: "K" },
];

/**
 * Compact count formatting: `999`, `1.2K`, `12K`, `3.4M`.
 * Values are truncated rather than rounded so a count never reads higher than
 * the real number. Negative and invalid input formats as `0`.
 */
export function formatCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "0";

  const value = Math.floor(count);
  for (const { threshold, suffix } of COUNT_UNITS) {
    if (value >= threshold) {
      const scaled = value / threshold;
      // One decimal below 10 (1.2K), whole numbers above (12K).
      const truncated =
        scaled < 10 ? Math.floor(scaled * 10) / 10 : Math.floor(scaled);
      return `${truncated}${suffix}`;
    }
  }

  return value.toString();
}

export type TimeInput = Date | string | number;

function toTimestamp(input: TimeInput): number {
  if (input instanceof Date) return input.getTime();
  if (typeof input === "number") return input;
  return new Date(input).getTime();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Compact relative timestamp: `now`, `5m`, `3h`, `2d`, `4w`, `7mo`, `2y`.
 * Future timestamps and invalid input read as `now`.
 */
export function timeAgo(input: TimeInput, now: TimeInput = Date.now()): string {
  const then = toTimestamp(input);
  const reference = toTimestamp(now);
  if (!Number.isFinite(then) || !Number.isFinite(reference)) return "now";

  const elapsed = reference - then;
  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d`;
  if (elapsed < MONTH) return `${Math.floor(elapsed / WEEK)}w`;
  if (elapsed < YEAR) return `${Math.floor(elapsed / MONTH)}mo`;
  return `${Math.floor(elapsed / YEAR)}y`;
}

/** Absolute, screen-reader friendly timestamp used as a `title`/`aria-label`. */
export function formatAbsoluteTime(input: TimeInput): string {
  const timestamp = toTimestamp(input);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toLocaleString("en", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** ISO string for a `<time dateTime>` attribute. */
export function toIsoString(input: TimeInput): string {
  const timestamp = toTimestamp(input);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toISOString();
}

/** Initials fallback for avatars: `Akin Yilmaz` -> `AY`, `akin` -> `AK`. */
export function initialsOf(name: string): string {
  const cleaned = name.trim().replace(/^@/, "");
  if (!cleaned) return "?";

  const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}
