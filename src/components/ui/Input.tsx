import type { ComponentPropsWithRef, ReactNode } from "react";

import { cn } from "@/lib/ui";

import { CONTROL_BASE, Field, controlBorder, describedBy } from "./Field";

export interface InputProps
  extends Omit<ComponentPropsWithRef<"input">, "size"> {
  id: string;
  label: string;
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: string | null;
  /** Icon rendered inside the field, on the leading edge. */
  leadingIcon?: ReactNode;
  /** Control rendered inside the field, on the trailing edge. */
  trailingSlot?: ReactNode;
  containerClassName?: string;
}

export function Input({
  id,
  label,
  hideLabel,
  hint,
  error,
  leadingIcon,
  trailingSlot,
  required,
  className,
  containerClassName,
  ...props
}: InputProps) {
  const hasError = Boolean(error);

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
      <div className="relative flex items-center">
        {leadingIcon ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 inline-flex text-fg-subtle"
          >
            {leadingIcon}
          </span>
        ) : null}
        <input
          {...props}
          id={id}
          required={required}
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy(id, Boolean(hint), hasError)}
          className={cn(
            CONTROL_BASE,
            controlBorder(hasError),
            "h-10",
            leadingIcon && "pl-9",
            trailingSlot && "pr-11",
            className,
          )}
        />
        {trailingSlot ? (
          <span className="absolute right-1.5 inline-flex items-center">
            {trailingSlot}
          </span>
        ) : null}
      </div>
    </Field>
  );
}
