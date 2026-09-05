"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TriangleAlert } from "@/components/ui/icons";

import { getSharedWaveCard } from "@/app/(app)/messages/actions";
import { routes } from "@/config/routes";
import { CREATION_TYPES } from "@/config/terminology";
import { Avatar, Skeleton } from "@/components/ui";
import type { Profile, Wave } from "@/types/domain";

export interface WaveShareCardProps {
  waveId: string;
}

/**
 * Compact card for a `wave_share` message (spec §22 deliverable 4): title,
 * creator, creation type, link. Self-hydrating via `getSharedWaveCard` so it
 * renders correctly whether the message arrived on initial page load,
 * "load older" or Realtime. The link is the only access path offered here —
 * `/w/[id]` enforces `can_view_wave` itself, so a recipient can never open a
 * Wave they aren't otherwise allowed to see (spec §14).
 */
export function WaveShareCard({ waveId }: WaveShareCardProps) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; wave: Wave; creator: Profile | null }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    void getSharedWaveCard(waveId).then((result) => {
      if (cancelled) return;
      if (result.ok && result.data) {
        setState({ status: "ready", wave: result.data.wave, creator: result.data.creator });
      } else {
        setState({ status: "error", message: result.error ?? "This Wave is no longer available." });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [waveId]);

  if (state.status === "loading") {
    return (
      <div className="flex w-64 flex-col gap-2 rounded-xl border border-border p-3">
        <Skeleton shape="line" width="70%" />
        <Skeleton shape="line" width="45%" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <p role="alert" className="flex w-64 items-center gap-1.5 rounded-xl border border-border p-3 text-sm text-danger">
        <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
        {state.message}
      </p>
    );
  }

  const { wave, creator } = state;
  const creationMeta = CREATION_TYPES[wave.creationType];
  const creatorName = creator ? (creator.displayName ?? `@${creator.username}`) : "Unknown creator";

  return (
    <Link
      href={routes.wave(wave.id)}
      className="flex w-64 items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Avatar name={creatorName} src={creator?.avatarUrl} size="md" className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg">{wave.title}</p>
        <p className="truncate text-xs text-fg-muted">
          {creatorName} · {creationMeta.glyph} {creationMeta.label}
        </p>
      </div>
    </Link>
  );
}
