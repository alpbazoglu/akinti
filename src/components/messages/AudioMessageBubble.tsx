"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";

import { WavePlayer, placeholderPeaks } from "@/components/audio";
import { Spinner } from "@/components/ui";

export interface AudioMessageBubbleProps {
  messageId: string;
  audioAssetId: string;
}

/** Simple string hash, used only to seed a stable decorative waveform per message. */
function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100_000;
  }
  return hash;
}

/**
 * An audio message (spec §22): private communication, never a Wave, never in
 * a feed. The signed URL is resolved through the same server-authorized path
 * every private audio asset uses (`GET /api/audio/[assetId]/url` →
 * `mintPlaybackUrl`, gated by `can_view_audio_asset` — which itself allows a
 * conversation member in, migration 10). Audio messages get no processing
 * job (spec §22), so there is no stored waveform; the bars shown are a
 * deterministic decorative shape, not real peak data.
 */
export function AudioMessageBubble({ messageId, audioAssetId }: AudioMessageBubbleProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/audio/${audioAssetId}/url`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`playback url request failed (${response.status})`);
        const data = (await response.json()) as { url?: string };
        if (!data.url) throw new Error("playback url response missing url");
        if (!cancelled) setAudioUrl(data.url);
      })
      .catch(() => {
        if (!cancelled) setError("This audio message could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [audioAssetId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-1.5 text-fg-subtle">
        <Spinner size="sm" label="Loading audio message" />
      </div>
    );
  }

  if (error || !audioUrl) {
    return (
      <p role="alert" className="flex items-center gap-1.5 py-1 text-sm text-danger">
        <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
        {error ?? "This audio message could not be loaded."}
      </p>
    );
  }

  return (
    <WavePlayer
      waveId={`message-${messageId}`}
      src={audioUrl}
      peaks={placeholderPeaks(40, hashSeed(messageId))}
      title="Audio message"
      variant="compact"
      className="min-w-52"
    />
  );
}
