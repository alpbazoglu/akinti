import type { ComponentPropsWithRef, ReactNode } from "react";

import { cn } from "@/lib/ui";

import { CONTROL_BASE, Field, controlBorder, describedBy } from "./Field";
import { ChevronDown } from "./icons";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SelectProps
  extends Omit<ComponentPropsWithRef<"select">, "children"> {
  id: string;
  label: string;
  options: readonly SelectOption[];
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: string | null;
  placeholder?: string;
  containerClassName?: string;
}

/**
 * Native `<select>`, styled. Native is deliberate: it gives correct mobile
 * behaviour and screen-reader support for free.
 */
export function Select({
  id,
  label,
  options,
  hideLabel,
  hint,
  error,
  placeholder,
  required,
  className,
  containerClassName,
  ...props
}: SelectProps) {
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
        <select
          {...props}
          id={id}
          required={required}
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy(id, Boolean(hint), hasError)}
          className={cn(
            CONTROL_BASE,
            controlBorder(hasError),
            "h-12 appearance-none pr-10",
            className,
          )}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3.5 size-4 text-ink-subtle"
        />
      </div>
    </Field>
  );
}
