"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";

import { cn } from "@/lib/ui";

import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction without collapsing the layout. */
  loading?: boolean;
  /** Announced while `loading` is true. */
  loadingLabel?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

const BASE =
  "relative inline-flex select-none items-center justify-center gap-2 rounded-full font-medium " +
  "transition-[background-color,border-color,color,box-shadow] duration-150 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
  "disabled:cursor-not-allowed disabled:opacity-55";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-fg-on-accent shadow-xs hover:bg-accent-hover active:bg-accent-active",
  secondary:
    "border border-border-strong bg-surface text-fg hover:bg-surface-muted active:bg-surface-inset",
  ghost: "text-fg-muted hover:bg-surface-muted hover:text-fg active:bg-surface-inset",
  danger: "bg-danger text-white shadow-xs hover:bg-danger-hover",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[0.8125rem]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
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
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        BASE,
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
    >
      {loading ? (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner size={size === "lg" ? "md" : "sm"} label={loadingLabel} />
        </span>
      ) : null}
      <span
        className={cn("inline-flex items-center gap-2", loading && "invisible")}
      >
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
