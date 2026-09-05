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
 * Label, control, hint and error (§8.9).
 *
 * The label sits **above** the field at caption size. There is no
 * placeholder-as-label anywhere in this product, ever (§12.39), and validation
 * is delivered inline beneath the field rather than as a toast.
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
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        htmlFor={id}
        className={cn("type-caption text-ink-muted", hideLabel && "sr-only")}
      >
        {label}
        {required ? (
          <span className="ml-0.5 text-ink-subtle" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={hintId(id)} className="type-caption measure text-ink-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId(id)} className="type-caption measure text-signal-deep" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * 48px tall, 10px radius, 1px hairline, transparent fill, 16px text so iOS
 * never zooms on focus (§8.9, `mobile-guidelines.md` rule 53).
 */
export const CONTROL_BASE =
  "w-full rounded-field border bg-transparent px-3.5 type-body text-ink " +
  "placeholder:text-ink-subtle " +
  "transition-[border-color,box-shadow] duration-[--dur-micro] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink " +
  "disabled:cursor-not-allowed disabled:bg-paper-sunk disabled:opacity-70";

/**
 * An error adds a 2px Signal underline to the field's bottom edge only. Never
 * a filled red field, never a coloured left border, never a red banner (§4.4).
 */
export function controlBorder(hasError: boolean): string {
  return hasError
    ? "border-hairline-strong border-b-2 border-b-signal"
    : "border-hairline hover:border-hairline-strong";
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
