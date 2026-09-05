"use client";

import Link from "next/link";

import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";

export interface FlowEmptyStateProps {
  /** A real error (network/RPC failure) shows a retry key; otherwise this is a genuinely empty ranking. */
  error?: string | null;
  onRetry?: () => void;
}

/**
 * Nothing to play (`docs/design/DESIGN.md`: "Empty states are left-aligned,
 * contain real next actions, never an icon in a grey circle above centred
 * text"). Left-aligned, three real next actions rather than a dead end —
 * record, browse challenges, find people to follow.
 */
export function FlowEmptyState({ error = null, onRetry }: FlowEmptyStateProps) {
  return (
    <div className="fixed inset-0 z-40 flex h-dvh flex-col justify-center gap-6 bg-paper px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col gap-2 text-left">
        <h1 className="type-title text-ink">{error ? "Flow couldn't load." : "Nothing new to play yet."}</h1>
        <p className="type-body text-ink-muted">
          {error ?? "Follow a few creators, or record something of your own to get the current moving."}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {error ? (
          <button
            type="button"
            onClick={onRetry}
            className="akinti-press flex h-13 items-center justify-start rounded-key bg-ink px-5 type-subhead text-on-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Try again
          </button>
        ) : (
          <>
            <Link
              href={routes.create()}
              className="akinti-press flex h-13 items-center justify-start rounded-key bg-ink px-5 type-subhead text-on-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {TERMS.record} {TERMS.aWave}
            </Link>
            <Link
              href={routes.challenges()}
              className="akinti-press flex h-13 items-center justify-start rounded-key border border-hairline-strong px-5 type-subhead text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
            >
              Browse challenges
            </Link>
            <Link
              href={routes.explore()}
              className="akinti-press flex h-13 items-center justify-start rounded-key border border-hairline-strong px-5 type-subhead text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
            >
              Find people to follow
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
