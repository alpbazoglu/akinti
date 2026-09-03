import { cn } from "@/lib/ui";

export type SkeletonShape = "line" | "block" | "circle";

export interface SkeletonProps {
  shape?: SkeletonShape;
  /** Any CSS width, e.g. `"60%"` or `"12rem"`. */
  width?: string;
  /** Any CSS height. Defaults per shape. */
  height?: string;
  className?: string;
}

const SHAPES: Record<SkeletonShape, string> = {
  line: "rounded-sm h-3",
  block: "rounded-md h-24",
  circle: "rounded-full size-10",
};

/**
 * Placeholder block for loading states. Decorative: the surrounding region
 * should carry the `aria-busy` / status announcement.
 */
export function Skeleton({ shape = "line", width, height, className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      style={{ width, height }}
      className={cn(
        "block bg-surface-inset",
        "motion-safe:[animation:akinti-pulse_1.6s_ease-in-out_infinite]",
        SHAPES[shape],
        className,
      )}
    />
  );
}
