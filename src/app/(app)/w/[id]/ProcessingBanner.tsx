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
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ProcessingErrorCode } from "@/config/terminology";
import type { AudioProcessingStatus } from "@/types/domain";
import { cn } from "@/lib/ui";

const POLL_INTERVAL_MS = 4000;

/**
 * Translated parallel to `getProcessingErrorMessage`'s English default map
 * (`@/config/terminology`, kept English-only there — a handful of other
 * call sites/tests still read the untranslated original directly). Same
 * code list, resolved here against the `ProcessingErrors` namespace instead.
 */
const PROCESSING_ERROR_KEY = {
  enhancement_failed: "enhancementFailed",
  decode_failed: "decodeFailed",
  silent_audio: "silentAudio",
} as const satisfies Record<ProcessingErrorCode, string>;

function translateProcessingError(
  code: string | null | undefined,
  t: (key: "enhancementFailed" | "decodeFailed" | "silentAudio") => string,
): string {
  const key = code && code in PROCESSING_ERROR_KEY ? PROCESSING_ERROR_KEY[code as ProcessingErrorCode] : null;
  return t(key ?? "enhancementFailed");
}

export interface ProcessingBannerProps {
  assetId: string;
  initialStatus: AudioProcessingStatus;
  initialError?: string | null;
}

export function ProcessingBanner({ assetId, initialStatus, initialError = null }: ProcessingBannerProps) {
  const t = useTranslations("ProcessingBanner");
  const tErrors = useTranslations("ProcessingErrors");
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

  // An honest strip, not a banner: one line of ink on a hairline, saying
  // exactly what is and is not true right now (§4.4, §12.18).
  return (
    <p
      role="status"
      className={cn(
        "type-body-sm measure border-l-0 py-2",
        isFailed ? "text-signal-deep" : "text-ink-muted",
      )}
    >
      {isFailed ? translateProcessingError(error, tErrors) : t("stillWorking")}
    </p>
  );
}
