import type { ReactNode } from "react";

import { cn } from "@/lib/ui";

export interface FieldProps {
  id: string;
  label: string;
  /** Hide the label visually but keep it for screen readers. */
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function hintId(id: string): string {
  return `${id}-hint`;
}

export function errorId(id: string): string {
  return `${id}-error`;
}

/**
 * Label + hint + error wrapper shared by every form control, so the
 * `aria-describedby` wiring is written once.
 */
export function Field({
  id,
  label,
  hideLabel = false,
  hint,
  error,
  required = false,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={id}
        className={cn(
          "text-[0.8125rem] font-medium text-fg",
          hideLabel && "sr-only",
        )}
      >
        {label}
        {required ? (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={hintId(id)} className="text-xs text-fg-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId(id)} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const CONTROL_BASE =
  "w-full rounded-md border bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle " +
  "transition-[border-color,box-shadow] duration-150 " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring " +
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70";

export function controlBorder(hasError: boolean): string {
  return hasError ? "border-danger" : "border-border-strong hover:border-fg-subtle";
}

export function describedBy(
  id: string,
  hasHint: boolean,
  hasError: boolean,
): string | undefined {
  const ids = [hasError ? errorId(id) : null, hasHint && !hasError ? hintId(id) : null]
    .filter(Boolean)
    .join(" ");
  return ids || undefined;
}
