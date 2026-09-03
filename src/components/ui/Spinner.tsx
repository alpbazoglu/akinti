import { cn } from "@/lib/ui";

import { VisuallyHidden } from "./VisuallyHidden";

export type SpinnerSize = "sm" | "md" | "lg";

export interface SpinnerProps {
  size?: SpinnerSize;
  /** Announced to screen readers. Pass `null` when a parent already labels it. */
  label?: string | null;
  className?: string;
}

const SIZES: Record<SpinnerSize, string> = {
  sm: "size-3.5 border-[1.5px]",
  md: "size-5 border-2",
  lg: "size-8 border-2",
};

export function Spinner({ size = "md", label = "Loading", className }: SpinnerProps) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-live={label ? "polite" : undefined}
      className={cn("inline-flex items-center justify-center", className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block rounded-full border-current border-t-transparent",
          "motion-safe:[animation:akinti-spin_0.7s_linear_infinite]",
          SIZES[size],
        )}
      />
      {label ? <VisuallyHidden>{label}</VisuallyHidden> : null}
    </span>
  );
}
