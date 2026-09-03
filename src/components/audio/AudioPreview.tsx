"use client";

import { useEffect, useId, useMemo } from "react";

import { WavePlayer } from "./WavePlayer";

export interface AudioPreviewProps {
  blob: Blob;
  durationMs: number;
  /** Client-computed preview peaks, e.g. from `decodeToPeaks()`. */
  peaks: readonly number[];
  title?: string;
  /** Stable id for the global playback store. Auto-generated if omitted. */
  waveId?: string;
  className?: string;
}

/**
 * Local preview of a not-yet-published recording or upload. Plays through
 * the same global playback store as a published Wave (spec §12: only one
 * Wave plays at a time, anywhere) via a `blob:` object URL. The URL is
 * derived synchronously from `blob` and released the moment it is replaced
 * or the component unmounts, so it never leaks across re-renders.
 */
export function AudioPreview({ blob, durationMs, peaks, title, waveId, className }: AudioPreviewProps) {
  const generatedId = useId();
  const id = waveId ?? `local-preview-${generatedId}`;
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [url]);

  return (
    <WavePlayer
      waveId={id}
      src={url}
      peaks={peaks}
      duration={durationMs / 1000}
      title={title ?? "Preview"}
      className={className}
    />
  );
}
