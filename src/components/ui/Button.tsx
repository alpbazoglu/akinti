"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";

import { cn } from "@/lib/ui";

import { Spinner } from "./Spinner";

/**
 * Keys, not buttons (`docs/design/DESIGN.md` §8.7).
 *
 * Three looks and no more:
 *   ink  - ink field, paper label. The single most important action on a screen.
 *   line - 1px hairline-strong, no fill, ink label. Secondary actions.
 *   text - ink label with a 1px hairline underline offset 3px. Tertiary and
 *          destructive, so "Delete account" is a sentence and not a red pill.
 *
 * The v1 variant names are the public API and map onto those three:
 * `primary` is the ink key, `secondary` the line key, `ghost` and `danger` the
 * text key. Nothing is a pill (§12.4) and nothing is coloured except a
 * destructive label, which uses the AA-safe Signal (§4.4).
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/** 52 / 44 / 40 / 32px tall, per §8.7. */
export type ButtonSize = "lg" | "md" | "sm" | "xs";

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction without collapsing the layout. */
  loading?: boolean;
  /** Announced while `loading` is true. */
  loadingLabel?: string;
  leadingIcon?: ReactNode;
  /**
   * Trailing glyph. Never an arrow appended to a label and never an icon in a
   * circle (§8.7) — this exists for counters and state marks.
   */
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

const BASE =
  "akinti-press relative inline-flex select-none items-center justify-center gap-2 " +
  "rounded-key type-subhead whitespace-nowrap " +
  "transition-[background-color,border-color,color] duration-[--dur-micro] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink " +
  "disabled:cursor-not-allowed disabled:opacity-55";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ink text-on-ink",
  secondary: "border border-hairline-strong text-ink",
  ghost:
    "text-ink underline decoration-hairline-strong decoration-1 underline-offset-[3px] " +
    "hover:decoration-ink",
  danger:
    "text-signal-deep underline decoration-signal-deep/60 decoration-1 underline-offset-[3px] " +
    "hover:decoration-signal-deep",
};

const SIZES: Record<ButtonSize, string> = {
  lg: "h-13 px-6",
  md: "h-11 px-5",
  sm: "h-10 px-4",
  xs: "h-8 px-3 type-caption",
};

/** Text keys are a sentence, not a field: they carry no side padding. */
const TEXT_KEY_SIZES: Record<ButtonSize, string> = {
  lg: "h-13 px-0",
  md: "h-11 px-0",
  sm: "h-10 px-0",
  xs: "h-8 px-0 type-caption",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel = "Working",
  leadingIcon,
  trailingIcon,
  fullWidth = false,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const isTextKey = variant === "ghost" || variant === "danger";

  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        BASE,
        VARIANTS[variant],
        (isTextKey ? TEXT_KEY_SIZES : SIZES)[size],
        fullWidth && "w-full",
        className,
      )}
    >
      {loading ? (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner size={size === "lg" ? "md" : "sm"} label={loadingLabel} />
        </span>
      ) : null}
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>
        {leadingIcon ? (
          <span aria-hidden="true" className="inline-flex shrink-0">
            {leadingIcon}
          </span>
        ) : null}
        {children}
        {trailingIcon ? (
          <span aria-hidden="true" className="inline-flex shrink-0">
            {trailingIcon}
          </span>
        ) : null}
      </span>
    </button>
  );
}
