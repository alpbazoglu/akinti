"use client";

import { useId, type ReactNode } from "react";

import { cn } from "@/lib/ui";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: ReactNode;
  /** Hide the label visually; it stays available to screen readers. */
  hideLabel?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/**
 * An on/off control. Uses `role="switch"` on a real button so keyboard
 * activation (Space/Enter) and state announcement come from the platform.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  hideLabel = false,
  disabled = false,
  id,
  className,
}: SwitchProps) {
  const generatedId = useId();
  const switchId = id ?? generatedId;
  const labelId = `${switchId}-label`;
  const descriptionId = `${switchId}-description`;

  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className={cn("min-w-0", hideLabel && "sr-only")}>
        <span id={labelId} className="block text-sm font-medium text-fg">
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="mt-0.5 block text-xs text-fg-subtle">
            {description}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        id={switchId}
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent",
          "transition-colors duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          "disabled:cursor-not-allowed disabled:opacity-55",
          checked ? "bg-accent" : "bg-surface-inset",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block size-5 rounded-full bg-surface shadow-xs ring-1 ring-border-strong",
            "transition-transform duration-150",
            checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
