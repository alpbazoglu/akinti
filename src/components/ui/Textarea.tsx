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
        className={cn(CONTROL_BASE, controlBorder(hasError), "resize-y py-2", className)}
      />
      {showCount && typeof maxLength === "number" ? (
        <p className="text-right text-xs text-fg-subtle tabular-nums" aria-hidden="true">
          {used} / {maxLength}
        </p>
      ) : null}
    </Field>
  );
}
