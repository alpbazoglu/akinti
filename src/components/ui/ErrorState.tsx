"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/ui";

import { Button } from "./Button";

export interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  /** When provided, a Try again key is rendered. */
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  /** Extra action, e.g. "Go to Explore". */
  action?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}

/**
 * The state a surface shows when an async operation failed.
 *
 * One sentence: what happened, then the repair. Left-aligned like every other
 * state in the product, with no icon in a coloured circle and no red banner —
 * error is a sentence plus a way out, not a colour (§4.4, §12.5).
 */
export function ErrorState({
  title = "Something didn't load",
  description = "Check your connection and try again.",
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
        "flex flex-col items-start text-left",
        size === "md" ? "gap-5 py-10" : "gap-4 py-6",
        className,
      )}
    >
      <div className="flex flex-col gap-2">
        <h2 className={cn("text-ink", size === "md" ? "type-heading" : "type-subhead")}>
          {title}
        </h2>
        {description ? (
          <p className="type-body-sm measure text-ink-muted">{description}</p>
        ) : null}
      </div>
      {onRetry || action ? (
        <div className="flex flex-wrap items-center gap-4">
          {onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry} loading={retrying}>
              {retryLabel}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
