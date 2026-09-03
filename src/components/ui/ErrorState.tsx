"use client";

import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { cn } from "@/lib/ui";

import { Button } from "./Button";

export interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  /** When provided, a Retry button is rendered. */
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  /** Extra action, e.g. "Go to Explore". */
  action?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}

/**
 * The state a surface shows when an async operation failed. Never fail
 * silently (spec section 38) — say what broke and offer a way out.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "We could not load this right now. Check your connection and try again.",
  onRetry,
  retryLabel = "Try again",
  retrying = false,
  action,
  size = "md",
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "md" ? "gap-4 px-6 py-14" : "gap-3 px-4 py-8",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-danger-soft text-danger",
          size === "md" ? "size-14" : "size-11",
        )}
      >
        <TriangleAlert className={size === "md" ? "size-6" : "size-5"} />
      </span>
      <div className="max-w-sm space-y-1.5">
        <h2 className={cn("font-semibold text-fg", size === "md" ? "text-base" : "text-sm")}>
          {title}
        </h2>
        {description ? (
          <p className="text-sm leading-relaxed text-fg-muted">{description}</p>
        ) : null}
      </div>
      {onRetry || action ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onRetry ? (
            <Button variant="secondary" onClick={onRetry} loading={retrying}>
              {retryLabel}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
