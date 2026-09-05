"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { Switch } from "@/components/ui";
import { ChevronDown, Pause, Play } from "@/components/ui/icons";
import {
  ADVANCED_EQ_BANDS,
  ADVANCED_EQ_MAX_GAIN_DB,
  ENHANCEMENT_PRESETS,
  PolishPreview,
  clampEqGain,
  defaultAdvancedEqSettings,
  usePlaybackStore,
  type AdvancedEqSettings,
  type EnhancementPresetId,
  type NoiseReductionStatus,
  type PolishMode,
} from "@/lib/audio";
import { cn } from "@/lib/ui";

export interface EnhancementPickerProps {
  blob: Blob;
  preset: EnhancementPresetId;
  onPresetChange: (preset: EnhancementPresetId) => void;
  advancedEq: AdvancedEqSettings | null;
  onAdvancedEqChange: (eq: AdvancedEqSettings | null) => void;
  /** Told which branch is audible, so a caller can morph its own trace. */
  onModeChange?: (mode: PolishMode) => void;
  className?: string;
}

/**
 * "Sounds like" (`docs/design/SCREENS.md` §4.4, spec §19).
 *
 * The A/B pair is the primary interaction on this screen, not the preset list:
 * it sits above the list, and switching keeps playing rather than restarting,
 * because that continuity is the only way to actually hear what a compressor
 * did. `PolishPreview` (`src/lib/audio/preview/`) runs both branches off one
 * media element permanently and crossfades between them.
 *
 * Six named sounds as 56px radio rows separated by hairlines, the selected one
 * carrying a filled ink dot and an ink-tint row. Not a grid of bordered tiles,
 * not chips, and nothing here is a pill (§12.1, §12.4).
 *
 * Everything is preview only: the published file is rendered server-side by
 * `scripts/worker.ts`, and nothing built in this component is ever uploaded.
 */
export function EnhancementPicker({
  blob,
  preset,
  onPresetChange,
  advancedEq,
  onAdvancedEqChange,
  onModeChange,
  className,
}: EnhancementPickerProps) {
  const store = usePlaybackStore();
  const reactId = useId();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [engine] = useState(() => new PolishPreview());

  const [mode, setMode] = useState<PolishMode>("polished");
  const [playing, setPlaying] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  // Off by default (PRODUCT_V2.md §3's "optional RNNoise WASM toggle").
  const [noiseReduction, setNoiseReduction] = useState(false);
  const [noiseStatus, setNoiseStatus] = useState<NoiseReductionStatus>("off");

  const url = useMemo(() => URL.createObjectURL(blob), [blob]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [url]);

  useEffect(() => {
    return () => {
      engine.destroy();
    };
  }, [engine]);

  // Preset and EQ changes are applied to the live graph; the audio does not
  // restart, so a comparison stays a comparison.
  useEffect(() => {
    engine.setPreset(preset, advancedEq);
  }, [engine, preset, advancedEq]);

  const play = useCallback(
    async (nextMode: PolishMode) => {
      const element = audioRef.current;
      if (!element) return;

      // One sound at a time, everywhere (spec §12): stop whatever Wave the
      // rest of the app is playing before a local preview starts.
      store.pause();

      if (!engine.isReady && !engine.connect(element)) {
        setUnavailable(true);
        // Without Web Audio there is no polished branch, so the honest thing
        // is to play the original and say the comparison is unavailable.
        try {
          await element.play();
          setPlaying(true);
          setMode("original");
          onModeChange?.("original");
        } catch {
          setPlaying(false);
        }
        return;
      }

      await engine.resume();
      engine.setPreset(preset, advancedEq);
      engine.setMode(nextMode);
      setMode(nextMode);
      onModeChange?.(nextMode);

      try {
        await element.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    },
    [engine, store, preset, advancedEq, onModeChange],
  );

  const handleAb = (nextMode: PolishMode) => {
    if (playing && mode === nextMode) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    if (playing) {
      // Already running: this is a comparison, not a restart.
      engine.setMode(nextMode);
      setMode(nextMode);
      onModeChange?.(nextMode);
      return;
    }
    void play(nextMode);
  };

  const handleNoiseReductionChange = (on: boolean) => {
    setNoiseReduction(on);
    setNoiseStatus(on ? "loading" : "off");
    void engine.setNoiseReduction(on).then(() => {
      setNoiseStatus(engine.noiseReductionStatus);
    });
  };

  const advancedEqId = `${reactId}-advanced-eq`;
  const noiseReductionDescription =
    noiseStatus === "loading"
      ? "Cleaning up background noise…"
      : noiseStatus === "unavailable"
        ? "Not available in this browser. Your Wave is still cleaned up after you publish."
        : "Runs an on-device filter while you compare. Your recording keeps the original sound.";

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <audio
        ref={audioRef}
        src={url}
        preload="auto"
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        className="hidden"
      >
        <track kind="captions" />
      </audio>

      {/* A/B. Active is an ink key, inactive a line key (§8.7) — never a
          segmented pill (§12.4). */}
      <div className="flex flex-col gap-2">
        <div role="group" aria-label="Compare the original with the polished take" className="flex gap-3">
          <AbKey
            active={mode === "original"}
            playing={playing && mode === "original"}
            label="Original"
            onClick={() => handleAb("original")}
          />
          <AbKey
            active={mode === "polished"}
            playing={playing && mode === "polished"}
            label="Polished"
            onClick={() => handleAb("polished")}
            disabled={unavailable}
          />
        </div>
        {unavailable ? (
          <p className="type-caption text-ink-subtle">
            This browser cannot preview the polish. Your Wave is still polished after you publish.
          </p>
        ) : null}
      </div>

      <div role="radiogroup" aria-label="Sounds like" className="flex flex-col">
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
                "flex h-14 items-center gap-4 border-t border-hairline px-3 text-left",
                "transition-colors duration-[--dur-micro]",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink",
                selected ? "bg-paper-sunk" : "hover:bg-paper-sunk/50",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-3 shrink-0 rounded-full border",
                  selected ? "border-ink bg-ink" : "border-hairline-strong",
                )}
              />
              <span className="type-subhead min-w-28 text-ink">{item.label}</span>
              <span className="type-caption truncate text-ink-subtle">{item.description}</span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-hairline pt-4">
        <Switch
          label="Reduce background noise"
          description={noiseReductionDescription}
          checked={noiseReduction}
          onCheckedChange={handleNoiseReductionChange}
        />
      </div>

      <div className="border-t border-hairline pt-4">
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
            "type-caption inline-flex items-center gap-1.5 text-ink-muted hover:text-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
          )}
        >
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-3.5 transition-transform duration-[--dur-micro]",
              advancedOpen && "rotate-180",
            )}
          />
          Advanced, five bands
        </button>

        {advancedOpen ? (
          <div id={advancedEqId} className="mt-4 flex gap-5">
            {ADVANCED_EQ_BANDS.map((band) => {
              const value = advancedEq?.[band] ?? 0;
              const bandId = `${reactId}-eq-${band}`;
              return (
                <div key={band} className="flex flex-col items-center gap-2">
                  <span className="type-mono-sm text-ink-subtle">
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
                      onAdvancedEqChange({
                        ...(advancedEq ?? defaultAdvancedEqSettings()),
                        [band]: clampEqGain(Number(event.target.value)),
                      });
                    }}
                    aria-valuetext={`${value} decibels`}
                    className="h-24 w-6 accent-ink [writing-mode:vertical-lr]"
                    style={{ direction: "rtl" }}
                  />
                  <label htmlFor={bandId} className="type-mono-sm text-ink-subtle">
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

function AbKey({
  active,
  playing,
  label,
  onClick,
  disabled = false,
}: {
  active: boolean;
  playing: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "akinti-press inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-key",
        "type-subhead transition-colors duration-[--dur-micro]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        "disabled:cursor-not-allowed disabled:opacity-55",
        active ? "bg-ink text-on-ink" : "border border-hairline-strong text-ink",
      )}
    >
      <span aria-hidden="true" className="inline-flex">
        {playing ? <Pause className="size-4" weight="fill" /> : <Play className="size-4" weight="fill" />}
      </span>
      {label}
    </button>
  );
}
