"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { getNotificationWaveAudio, type NotificationWaveAudio } from "@/app/(app)/notifications/actions";
import { WavePlayer } from "@/components/audio";
import { IconButton } from "@/components/ui";
import { Play, TriangleAlert } from "@/components/ui/icons";

export interface NotificationWavePreviewProps {
  waveId: string;
}

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: NotificationWaveAudio; src: string }
  | { status: "error"; message: string };

/**
 * "Inline play for audio notifications" (`DESIGN_V3_DESKTOP.md`): a Wave-
 * linked notification row (comment, save, share, a Duet event) can be
 * previewed without leaving the list. Nothing is fetched until the reader
 * asks for it — a page of twenty notifications never opens twenty signed
 * URLs on mount, the same lazy-resolve discipline `useSignedAudio` and
 * `AudioMessageBubble` already use elsewhere.
 *
 * Once loaded this hands off to `WavePlayer`'s `compact` variant — the one
 * shared trace-plus-transport drawing (§8.4) — so this never re-implements
 * play/pause or the global playback store itself.
 */
export function NotificationWavePreview({ waveId }: NotificationWavePreviewProps) {
  const t = useTranslations("NotificationWavePreview");
  const [state, setState] = useState<PreviewState>({ status: "idle" });

  const handlePlay = () => {
    if (state.status === "loading" || state.status === "ready") return;
    setState({ status: "loading" });
    void getNotificationWaveAudio(waveId).then(async (result) => {
      if (!result.ok || !result.data) {
        setState({ status: "error", message: result.error ?? t("couldNotLoad") });
        return;
      }
      try {
        const response = await fetch(`/api/audio/${result.data.audioAssetId}/url`, { cache: "no-store" });
        if (!response.ok) throw new Error(`playback url request failed (${response.status})`);
        const payload = (await response.json()) as { url?: string };
        if (!payload.url) throw new Error("playback url response missing url");
        setState({ status: "ready", data: result.data, src: payload.url });
      } catch {
        setState({ status: "error", message: t("couldNotLoad") });
      }
    });
  };

  if (state.status === "ready") {
    return (
      <WavePlayer
        waveId={state.data.waveId}
        src={state.src}
        peaks={state.data.peaks}
        duration={state.data.durationMs / 1000}
        title={state.data.title}
        creatorUsername={state.data.creatorName ?? undefined}
        variant="compact"
        className="mt-2 max-w-72"
      />
    );
  }

  if (state.status === "error") {
    return (
      <p role="alert" className="mt-2 flex items-center gap-1.5 type-caption text-signal-deep">
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
        {state.message}
      </p>
    );
  }

  return (
    <IconButton
      label={t("playLabel")}
      icon={<Play className="size-4" weight="fill" />}
      variant="secondary"
      size="sm"
      shape="round"
      loading={state.status === "loading"}
      onClick={handlePlay}
      className="mt-2"
    />
  );
}
