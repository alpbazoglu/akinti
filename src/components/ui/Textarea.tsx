import type { ComponentPropsWithRef, ReactNode } from "react";

import { cn } from "@/lib/ui";

import { CONTROL_BASE, Field, controlBorder, describedBy } from "./Field";

export interface TextareaProps extends ComponentPropsWithRef<"textarea"> {
  id: string;
  label: string;
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: string | null;
  /** Shows a `used / maxLength` counter. Requires `maxLength` and `value`. */
  showCount?: boolean;
  containerClassName?: string;
}

/** Counters appear only above 80% of the limit (§8.9). */
const COUNTER_THRESHOLD = 0.8;

/** Textareas are 96px minimum and grow (§8.9). */
export function Textarea({
  id,
  label,
  hideLabel,
  hint,
  error,
  showCount = false,
  required,
  className,
  containerClassName,
  rows = 4,
  maxLength,
  value,
  ...props
}: TextareaProps) {
  const hasError = Boolean(error);
  const used = typeof value === "string" ? value.length : 0;
  const nearLimit =
    typeof maxLength === "number" && maxLength > 0 && used / maxLength >= COUNTER_THRESHOLD;

  return (
    <Field
      id={id}
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      <textarea
        {...props}
        id={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        required={required}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy(id, Boolean(hint), hasError)}
        className={cn(CONTROL_BASE, controlBorder(hasError), "min-h-24 resize-y py-3", className)}
      />
      {showCount && typeof maxLength === "number" && nearLimit ? (
        <p className="type-mono-sm text-right text-ink-subtle" aria-hidden="true">
          {used}/{maxLength}
        </p>
      ) : null}
    </Field>
  );
}
