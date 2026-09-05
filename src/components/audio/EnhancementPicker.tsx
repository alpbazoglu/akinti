"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Pause, Play } from "@/components/ui/icons";

import {
  ADVANCED_EQ_BANDS,
  ADVANCED_EQ_MAX_GAIN_DB,
  ENHANCEMENT_PRESETS,
  clampEqGain,
  createAdvancedEqGraph,
  createPreviewGraph,
  defaultAdvancedEqSettings,
  usePlaybackStore,
  type AdvancedEqSettings,
  type EnhancementPresetId,
} from "@/lib/audio";
import { Chip } from "@/components/ui";
import { cn } from "@/lib/ui";

export interface EnhancementPickerProps {
  blob: Blob;
  preset: EnhancementPresetId;
  onPresetChange: (preset: EnhancementPresetId) => void;
  advancedEq: AdvancedEqSettings | null;
  onAdvancedEqChange: (eq: AdvancedEqSettings | null) => void;
  className?: string;
}

type PreviewMode = "original" | "enhanced" | null;

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}

/**
 * The six accessible presets (spec §19), each with an A/B "Original /
 * Enhanced" preview built from a lightweight local Web Audio graph
 * (`createPreviewGraph` in `lib/audio/enhancement.ts`) — never the real,
 * server-side ffmpeg processing. The optional advanced 5-band EQ sits behind
 * a disclosure, applied on top of the chosen preset.
 */
export function EnhancementPicker({
  blob,
  preset,
  onPresetChange,
  advancedEq,
  onAdvancedEqChange,
  className,
}: EnhancementPickerProps) {
  const store = usePlaybackStore();
  const reactId = useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [url]);

  useEffect(() => {
    return () => {
      const ctx = audioContextRef.current;
      audioContextRef.current = null;
      sourceNodeRef.current = null;
      if (ctx) void ctx.close().catch(() => {});
    };
  }, []);

  const rebuildGraph = (mode: "original" | "enhanced") => {
    const audio = audioRef.current;
    const ctx = audioContextRef.current;
    if (!audio || !ctx) return;

    if (!sourceNodeRef.current) {
      sourceNodeRef.current = ctx.createMediaElementSource(audio);
    }
    const source = sourceNodeRef.current;
    source.disconnect();

    let end: AudioNode = source;
    if (mode === "enhanced") {
      end = createPreviewGraph(ctx, source, preset);
      if (advancedEq) {
        end = createAdvancedEqGraph(ctx, end, advancedEq);
      }
    }
    end.connect(ctx.destination);
  };

  const stopPreview = () => {
    audioRef.current?.pause();
    setPreviewMode(null);
  };

  const startPreview = async (mode: "original" | "enhanced") => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audioContextRef.current) {
      const Ctor = getAudioContextCtor();
      if (!Ctor) {
        setPreviewUnavailable(true);
        return;
      }
      audioContextRef.current = new Ctor();
    }

    // Enforce the "one Wave/sound at a time" rule (spec §12) against the rest
    // of the app before starting a local preview.
    store.pause();

    rebuildGraph(mode);
    try {
      await audioContextRef.current.resume();
      audio.currentTime = 0;
      await audio.play();
      setPreviewMode(mode);
    } catch {
      setPreviewMode(null);
    }
  };

  const togglePreview = (mode: "original" | "enhanced") => {
    if (previewMode === mode) {
      stopPreview();
    } else {
      void startPreview(mode);
    }
  };

  useEffect(() => {
    if (previewMode === "enhanced") {
      rebuildGraph("enhanced");
    }
    // Rebuild the live graph when the preset or EQ changes mid-preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, advancedEq]);

  const advancedEqId = `${reactId}-advanced-eq`;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <audio
        ref={audioRef}
        src={url}
        preload="auto"
        onEnded={() => setPreviewMode(null)}
        className="hidden"
      >
        <track kind="captions" />
      </audio>

      <div
        role="radiogroup"
        aria-label="Enhancement preset"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {ENHANCEMENT_PRESETS.map((item) => {
          const selected = preset === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onPresetChange(item.id)}
              className={cn(
                "flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                selected
                  ? "border-accent bg-accent-soft text-accent-soft-fg"
                  : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg",
              )}
            >
              <span className="text-sm font-medium">{item.label}</span>
              <span className="text-xs text-fg-subtle">{item.description}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span id={`${reactId}-ab-label`} className="text-xs font-medium text-fg-subtle">
          Preview
        </span>
        <div role="group" aria-labelledby={`${reactId}-ab-label`} className="flex gap-2">
          <Chip
            selected={previewMode === "original"}
            onClick={() => togglePreview("original")}
            icon={
              previewMode === "original" ? (
                <Pause className="size-3.5" />
              ) : (
                <Play className="size-3.5" />
              )
            }
          >
            Original
          </Chip>
          <Chip
            selected={previewMode === "enhanced"}
            onClick={() => togglePreview("enhanced")}
            icon={
              previewMode === "enhanced" ? (
                <Pause className="size-3.5" />
              ) : (
                <Play className="size-3.5" />
              )
            }
          >
            Enhanced
          </Chip>
        </div>
        {previewUnavailable ? (
          <span className="text-xs text-fg-subtle">Preview is not available in this browser.</span>
        ) : null}
      </div>

      <div>
        <button
          type="button"
          onClick={() => {
            const next = !advancedOpen;
            setAdvancedOpen(next);
            if (next && !advancedEq) onAdvancedEqChange(defaultAdvancedEqSettings());
          }}
          aria-expanded={advancedOpen}
          aria-controls={advancedEqId}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium text-fg-muted hover:text-fg",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <ChevronDown
            aria-hidden="true"
            className={cn("size-3.5 transition-transform duration-150", advancedOpen && "rotate-180")}
          />
          Advanced EQ
        </button>

        {advancedOpen ? (
          <div id={advancedEqId} className="mt-3 flex gap-4">
            {ADVANCED_EQ_BANDS.map((band) => {
              const value = advancedEq?.[band] ?? 0;
              const bandId = `${reactId}-eq-${band}`;
              return (
                <div key={band} className="flex flex-col items-center gap-1.5">
                  <span className="text-[0.6875rem] tabular-nums text-fg-subtle">
                    {value > 0 ? `+${value}` : value}
                  </span>
                  <input
                    id={bandId}
                    type="range"
                    min={-ADVANCED_EQ_MAX_GAIN_DB}
                    max={ADVANCED_EQ_MAX_GAIN_DB}
                    step={1}
                    value={value}
                    onChange={(event) => {
                      const nextValue = clampEqGain(Number(event.target.value));
                      onAdvancedEqChange({
                        ...(advancedEq ?? defaultAdvancedEqSettings()),
                        [band]: nextValue,
                      });
                    }}
                    aria-valuetext={`${value} decibels`}
                    className="h-24 w-6 accent-accent [writing-mode:vertical-lr]"
                    style={{ direction: "rtl" }}
                  />
                  <label htmlFor={bandId} className="text-[0.6875rem] text-fg-subtle">
                    {band >= 1000 ? `${band / 1000}k` : band}
                  </label>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
