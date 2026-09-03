"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";

import { cn } from "@/lib/ui";

import { Spinner } from "./Spinner";
import { VisuallyHidden } from "./VisuallyHidden";

export type IconButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type IconButtonSize = "sm" | "md" | "lg";

export interface IconButtonProps
  extends Omit<ComponentPropsWithRef<"button">, "children"> {
  /** Required: an icon-only control must still be named. */
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  loading?: boolean;
  /** Render the label visibly next to the icon instead of only for readers. */
  showLabel?: boolean;
}

const BASE =
  "relative inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-full " +
  "transition-[background-color,border-color,color] duration-150 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
  "disabled:cursor-not-allowed disabled:opacity-55";

const VARIANTS: Record<IconButtonVariant, string> = {
  primary: "bg-accent text-fg-on-accent shadow-xs hover:bg-accent-hover",
  secondary:
    "border border-border-strong bg-surface text-fg hover:bg-surface-muted",
  ghost: "text-fg-muted hover:bg-surface-muted hover:text-fg",
  danger: "bg-danger text-white hover:bg-danger-hover",
};

const SIZES: Record<IconButtonSize, string> = {
  sm: "size-8",
  md: "size-10",
  lg: "size-12",
};

const LABELLED_SIZES: Record<IconButtonSize, string> = {
  sm: "h-8 w-auto px-3 text-[0.8125rem]",
  md: "h-10 w-auto px-4 text-sm",
  lg: "h-12 w-auto px-5 text-base",
};

export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  loading = false,
  showLabel = false,
  className,
  disabled,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      title={showLabel ? undefined : label}
      className={cn(
        BASE,
        VARIANTS[variant],
        showLabel ? LABELLED_SIZES[size] : SIZES[size],
        className,
      )}
    >
      {loading ? (
        <Spinner size={size === "lg" ? "md" : "sm"} label={null} />
      ) : (
        <span aria-hidden="true" className="inline-flex">
          {icon}
        </span>
      )}
      {showLabel ? <span>{label}</span> : <VisuallyHidden>{label}</VisuallyHidden>}
    </button>
  );
}
