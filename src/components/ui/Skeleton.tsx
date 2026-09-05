import { cn } from "@/lib/ui";

/**
 * `waterline` is the shape a trace leaves behind: a flat 6px line in
 * `wave-rest`. Never a fake waveform, never a shimmer (§8.15, §12.32).
 */
export type SkeletonShape = "line" | "block" | "circle" | "waterline";

export interface SkeletonProps {
  shape?: SkeletonShape;
  /** Any CSS width, e.g. `"60%"` or `"12rem"`. */
  width?: string;
  /** Any CSS height. Defaults per shape. */
  height?: string;
  className?: string;
}

const SHAPES: Record<SkeletonShape, string> = {
  line: "h-3 rounded-label bg-paper-sunk",
  block: "h-24 rounded-field bg-paper-sunk",
  // The rail carries a squircle avatar, so its placeholder is one too (§8.10).
  circle: "size-11 rounded-[15px] bg-paper-sunk",
  waterline: "h-1.5 w-full rounded-none bg-wave-rest",
};

/**
 * Placeholder shaped to the final layout (§8.15). Decorative: the surrounding
 * region carries the `aria-busy` / status announcement.
 *
 * There is no pulse and no shimmer here on purpose. A shimmering skeleton is
 * an infinite animation, and the record lamp is the only infinite animation in
 * the product (§12.34).
 */
export function Skeleton({ shape = "line", width, height, className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      style={{ width, height }}
      className={cn("block", SHAPES[shape], className)}
    />
  );
}
