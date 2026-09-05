"use client";

/**
 * "Processing" state for the Wave detail page (spec §19, §38): while the
 * worker hasn't produced a processed file yet, playback already works
 * (`mintPlaybackUrl` falls back to the original) but this banner says so
 * honestly instead of staying silent about it.
 *
 * Live-updates via polling, not Realtime: `processing_status` is a column
 * anon/authenticated already has direct SELECT on (migration 15), so a
 * lightweight `setInterval` re-read through the ordinary RLS-scoped browser
 * client is simpler than standing up a `postgres_changes` subscription
 * (connect/reconnect/cleanup) for a state that only ever needs to update a
 * few times over a few minutes. `audio_assets` is included in the
 * `supabase_realtime` publication (migration 16) if a future pass wants to
 * switch this to push-based updates instead.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "@/components/ui/icons";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { AudioProcessingStatus } from "@/types/domain";
import { cn } from "@/lib/ui";

const POLL_INTERVAL_MS = 4000;

export interface ProcessingBannerProps {
  assetId: string;
  initialStatus: AudioProcessingStatus;
  initialError?: string | null;
}

export function ProcessingBanner({ assetId, initialStatus, initialError = null }: ProcessingBannerProps) {
  const [status, setStatus] = useState<AudioProcessingStatus>(initialStatus);
  const [error, setError] = useState<string | null>(initialError);

  useEffect(() => {
    if (status === "ready" || status === "failed" || !isSupabaseConfigured()) {
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    const poll = async (): Promise<void> => {
      const { data, error: fetchError } = await supabase
        .from("audio_assets")
        .select("processing_status,processing_error")
        .eq("id", assetId)
        .maybeSingle();
      if (cancelled || fetchError || !data) return;
      setStatus(data.processing_status);
      setError(data.processing_error);
    };

    const interval = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [assetId, status]);

  if (status === "ready") {
    return null;
  }

  const isFailed = status === "failed";

  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        isFailed
          ? "border-danger/30 bg-danger-soft text-danger-soft-fg"
          : "border-border-strong bg-surface-muted text-fg-muted",
      )}
    >
      {isFailed ? (
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
      ) : (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
      )}
      <span>
        {isFailed
          ? (error ?? "This recording failed to process.")
          : "Still processing — enhanced audio and the final waveform will appear shortly. Playback works now with the original file."}
      </span>
    </div>
  );
}
