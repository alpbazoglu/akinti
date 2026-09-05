import type { ComponentPropsWithRef, ReactNode } from "react";

import { cn } from "@/lib/ui";

import { CONTROL_BASE, Field, controlBorder, describedBy } from "./Field";
import { Check } from "./icons";

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
  /**
   * An availability confirmation: a small current-coloured tick inside the
   * field, not a green banner (§8.9). Signal itself stays exclusive to live
   * audio (`docs/design/COLOR_V2.md` principle 2) — this was never audio
   * state, so it moved off Signal onto the current, matching "success is
   * the current" (COLOR_V2 semantic colour). Ignored when `trailingSlot` is
   * supplied.
   */
  confirmed?: boolean;
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
  confirmed = false,
  required,
  className,
  containerClassName,
  ...props
}: InputProps) {
  const hasError = Boolean(error);
  const showTick = confirmed && !trailingSlot && !hasError;

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
            className="pointer-events-none absolute left-3.5 inline-flex text-ink-subtle"
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
          // Password managers (1Password, Bitwarden, the browser's own
          // autofill) commonly stamp an inline style — most often
          // `caret-color: transparent`, to hide the caret behind their own
          // fill icon — onto exactly this kind of `email`/`password` field
          // before React hydrates. That's a real DOM mutation from outside
          // React, not a server/client render difference this component
          // controls, so it's the documented case for `suppressHydrationWarning`
          // (https://react.dev/link/hydration-mismatch) rather than something
          // to chase away by changing what's rendered.
          suppressHydrationWarning
          className={cn(
            CONTROL_BASE,
            controlBorder(hasError),
            "h-12",
            leadingIcon && "pl-10",
            (trailingSlot || showTick) && "pr-11",
            className,
          )}
        />
        {trailingSlot ? (
          <span className="absolute right-2 inline-flex items-center">{trailingSlot}</span>
        ) : null}
        {showTick ? (
          <span
            aria-hidden="true"
            className="absolute right-3.5 inline-flex items-center text-tide"
          >
            <Check className="size-4" />
          </span>
        ) : null}
      </div>
    </Field>
  );
}
