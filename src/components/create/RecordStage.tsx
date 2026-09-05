"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { LiveWaterline, Waveform } from "@/components/audio";
import { Button, IconButton, RecordKey, Switch } from "@/components/ui";
import { Pause, Play, Upload, X } from "@/components/ui/icons";
import {
  LiveMonitor,
  MAX_RECORDING_MS,
  getRecordPreferences,
  getServerRecordPreferences,
  setRecordPreferences,
  subscribeRecordPreferences,
  useRecorder,
  usePlaybackStore,
  type MonitorSample,
  type RecorderMediaStreamLike,
} from "@/lib/audio";
import { cn, formatDuration } from "@/lib/ui";

import { Countdown } from "./Countdown";
import { LevelReadout, PitchMeter } from "./Readouts";
import { MicDenied, MicPrimer, MicUnsupported } from "./MicPermission";
import { useTrackAudio } from "./useTrackAudio";

export interface RecordStageBackingTrack {
  readonly id: string;
  readonly title: string;
  readonly artistCredit: string;
  readonly audioAssetId: string;
  readonly durationMs: number | null;
}

export interface CapturedTake {
  readonly blob: Blob;
  readonly mimeType: string;
  readonly durationMs: number;
  /** How far into the backing track the take actually started, in ms. */
  readonly startOffsetMs: number;
  /** True when the browser ended the take (tab hidden), not the user. */
  readonly interrupted: boolean;
}

export interface RecordStageProps {
  onCaptured: (take: CapturedTake) => void;
  /** Switch to the upload path, which needs no microphone. */
  onUpload: () => void;
  /** Open the backing-track browser. */
  onChooseTrack: () => void;
  onClearTrack: () => void;
  backingTrack: RecordStageBackingTrack | null;
  className?: string;
}

const SILENT: MonitorSample = { rms: 0, db: -60, clipping: false, pitch: null };

/** The dormant trace draws ticks, not data: it needs no peaks (§6.2). */
const NO_PEAKS: readonly number[] = [];

/** How long a press has to be held before it counts as "hold to record". */
const HOLD_MS = 350;

type Gate = "counting" | "none";

/**
 * The record screen, idle and recording (`docs/design/SCREENS.md` §4.1, §4.2).
 *
 * One screen with two states, not two screens: the header, the key and the
 * trace transform in place, because five fades where one morph would do is
 * what makes a flow feel assembled rather than designed (§7.2).
 *
 * The record key is the largest target here and the transport never competes
 * with it (§12.10). Idle is an ink field with a Signal lamp; recording
 * inverts to a Signal field with an ink square. The lamp is the dot, not the
 * key — that is the hardware convention, and it makes the inversion a genuine
 * event rather than a hover state (§8.5).
 *
 * Everything live on this screen is honest about time: the trace is drawn
 * from the input at the rate the input arrives, the timer is linear, and
 * nothing eases (§6.3, §12.7).
 */
export function RecordStage({
  onCaptured,
  onUpload,
  onChooseTrack,
  onClearTrack,
  backingTrack,
  className,
}: RecordStageProps) {
  const store = usePlaybackStore();
  const preferences = useSyncExternalStore(
    subscribeRecordPreferences,
    getRecordPreferences,
    getServerRecordPreferences,
  );

  const { state, start, pause, resume, stop, recorder } = useRecorder({
    maxDurationMs: MAX_RECORDING_MS,
    tickIntervalMs: 100,
    // The monitor below owns the one `AudioContext` on this screen; a second
    // analyser on the same stream would be a second sample of the same audio
    // at a different instant.
    createAudioContext: () => null,
  });

  const [monitor] = useState(() => new LiveMonitor());
  const [gate, setGate] = useState<Gate>("none");
  const [armed, setArmed] = useState(false);
  const [sample, setSample] = useState<MonitorSample>(SILENT);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [suppressorFailed, setSuppressorFailed] = useState(false);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);
  const reportedRef = useRef<Blob | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const startOffsetRef = useRef(0);
  const previousStatus = useRef(state.status);

  const track = useTrackAudio(backingTrack?.audioAssetId ?? null);
  const trackWaveId = backingTrack ? `backing-track:${backingTrack.id}` : null;

  const recording = state.status === "recording";
  const paused = state.status === "paused";
  const live = recording || paused;

  /* -------------------------------------------------------------- */
  /* Monitor lifecycle                                              */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    const unsubscribe = recorder.onStream((stream: RecorderMediaStreamLike | null) => {
      void monitor.attach(stream as unknown as MediaStream | null).then(() => {
        setLatencyMs(monitor.latencyMs);
        monitor.setMonitoring(preferences.monitoring);
        if (preferences.noisyRoom) {
          void monitor.setNoiseSuppression(true).then(() => {
            setSuppressorFailed(preferences.noisyRoom && !monitor.isSuppressing);
          });
        }
      });
    });
    return () => {
      unsubscribe();
      monitor.detach();
    };
    // `preferences` is read at attach time only; the toggles below apply
    // changes to the live graph directly rather than rebuilding it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, monitor]);

  useEffect(() => {
    return () => {
      monitor.detach();
    };
  }, [monitor]);

  /* -------------------------------------------------------------- */
  /* Wake lock, page lifecycle                                      */
  /* -------------------------------------------------------------- */

  // The screen must not sleep mid-take (`mobile-guidelines.md` rule 26).
  useEffect(() => {
    if (!live) return;
    let released = false;

    const request = async () => {
      try {
        if (!("wakeLock" in navigator)) return;
        const sentinel = await navigator.wakeLock.request("screen");
        if (released) {
          await sentinel.release().catch(() => {});
          return;
        }
        wakeLockRef.current = sentinel;
      } catch {
        // Denied, unsupported, or the tab lost focus first. The take is fine.
      }
    };
    void request();

    return () => {
      released = true;
      void wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [live]);

  // A hidden tab loses the microphone on several engines, and an unload loses
  // everything. Stop cleanly so the audio captured so far is kept and the
  // draft can be written, rather than ending up with a truncated blob nobody
  // asked for.
  useEffect(() => {
    if (!live) return;
    const onHidden = () => {
      if (document.visibilityState === "hidden") recorder.stopBecauseHidden();
    };
    const onPageHide = () => recorder.stopBecauseHidden();
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [live, recorder]);

  /* -------------------------------------------------------------- */
  /* Backing track transport                                        */
  /* -------------------------------------------------------------- */

  // Start the track at the instant capture actually begins, so the vocal's
  // zero and the track's zero are the same moment — which is exactly what the
  // mixdown assumes. Measured, not asserted: `startOffsetMs` records the
  // residual, the same way the Duet recorder does.
  useEffect(() => {
    const previous = previousStatus.current;
    previousStatus.current = state.status;
    if (state.status === "recording" && previous !== "recording") {
      if (trackWaveId && track.url) {
        store.seek(0);
        store.resume();
        startOffsetRef.current = Math.round(store.getState().currentTime * 1000);
      } else {
        startOffsetRef.current = 0;
      }
    }
    if (state.status !== "recording" && previous === "recording") {
      if (trackWaveId) store.pause();
    }
  }, [state.status, store, trackWaveId, track.url]);

  /* -------------------------------------------------------------- */
  /* Handing the take on                                            */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    const result = state.result;
    if (!result || reportedRef.current === result.blob) return;
    reportedRef.current = result.blob;
    onCaptured({
      blob: result.blob,
      mimeType: result.mimeType,
      durationMs: result.durationMs,
      startOffsetMs: startOffsetRef.current,
      interrupted: state.interrupted,
    });
  }, [state.result, state.interrupted, onCaptured]);

  /* -------------------------------------------------------------- */
  /* Controls                                                       */
  /* -------------------------------------------------------------- */

  const primeTrack = useCallback(() => {
    if (!trackWaveId || !track.url || !backingTrack) return;
    // Inside the press gesture: this is what unlocks the media element on
    // iOS, so resuming it after the count-in is allowed
    // (`mobile-guidelines.md` rule 24, rule 32).
    store.play(trackWaveId, track.url, {
      title: backingTrack.title,
      creatorUsername: backingTrack.artistCredit,
      duration: backingTrack.durationMs ? backingTrack.durationMs / 1000 : undefined,
    });
    store.pause();
    store.seek(0);
  }, [store, track.url, trackWaveId, backingTrack]);

  const beginTake = useCallback(() => {
    setArmed(false);
    if (preferences.countdown) {
      setGate("counting");
      return;
    }
    start();
  }, [preferences.countdown, start]);

  const onCountdownComplete = useCallback(() => {
    setGate("none");
    start();
  }, [start]);

  const handlePointerDown = () => {
    heldRef.current = false;
    holdTimer.current = setTimeout(() => {
      heldRef.current = true;
      primeTrack();
      beginTake();
    }, HOLD_MS);
  };

  const handlePointerUp = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (heldRef.current) return;
    // A tap arms; a second tap starts. Holding skips straight to the take.
    if (armed) {
      primeTrack();
      beginTake();
    } else {
      setArmed(true);
    }
  };

  const handleKeyActivate = () => {
    primeTrack();
    if (armed) beginTake();
    else setArmed(true);
  };

  useEffect(() => {
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  const toggleMonitoring = (on: boolean) => {
    setRecordPreferences({ monitoring: on, headphonesHintSeen: true });
    monitor.setMonitoring(on);
    setLatencyMs(monitor.latencyMs);
  };

  const toggleNoisyRoom = (on: boolean) => {
    setRecordPreferences({ noisyRoom: on });
    setSuppressorFailed(false);
    void monitor.setNoiseSuppression(on).then(() => {
      setSuppressorFailed(on && !monitor.isSuppressing);
    });
  };

  /* -------------------------------------------------------------- */
  /* Permission surfaces                                            */
  /* -------------------------------------------------------------- */

  if (state.status === "denied") {
    return <MicDenied onRetry={start} onUpload={onUpload} className={className} />;
  }
  if (state.status === "unsupported") {
    return <MicUnsupported onUpload={onUpload} reason={state.error} className={className} />;
  }

  const elapsedSeconds = state.elapsedMs / 1000;
  const counting = gate === "counting";

  return (
    <section className={cn("flex min-h-0 flex-1 flex-col gap-8", className)}>
      {/* The trace. Dormant ticks before anything is pressed — not zeros, not
          a flat line, and never a fake waveform (§6.2). */}
      <div className="akinti-edge-fade -mx-page">
        {live || counting ? (
          <LiveWaterline monitor={monitor} active={recording} height={96} onSample={setSample} />
        ) : (
          <Waveform peaks={NO_PEAKS} state="dormant" height={96} readOnly label="Nothing recorded yet" />
        )}
      </div>

      <div className="flex items-baseline justify-between gap-4">
        <p className="type-mono-lg text-ink">
          {formatDuration(elapsedSeconds)}
          <span className="type-mono text-ink-subtle"> / {formatDuration(MAX_RECORDING_MS / 1000)}</span>
        </p>
        {live ? <LevelReadout db={sample.db} rms={sample.rms} /> : null}
      </div>

      {live ? <PitchMeter pitch={sample.pitch} /> : null}

      <div aria-live="polite" role="status" className="sr-only">
        {announce(state.status, state.autoStopped, state.interrupted)}
      </div>

      {counting ? (
        <Countdown onComplete={onCountdownComplete} />
      ) : (
        <div className="flex items-center gap-8">
          {live ? (
            <>
              <IconButton
                label={paused ? "Resume recording" : "Pause recording"}
                icon={
                  paused ? (
                    <Play className="size-5 translate-x-px" weight="fill" />
                  ) : (
                    <Pause className="size-5" weight="fill" />
                  )
                }
                variant="secondary"
                shape="round"
                size="md"
                onClick={paused ? resume : pause}
              />
              <RecordKey
                label="Stop recording"
                size={72}
                state={paused ? "paused" : "recording"}
                onClick={stop}
              />
            </>
          ) : (
            <RecordKey
              label={armed ? "Start recording" : "Arm the microphone"}
              size={88}
              state={
                state.status === "requesting" ? "armed" : armed ? "armed" : "idle"
              }
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleKeyActivate();
                }
              }}
            />
          )}
        </div>
      )}

      {!live && !counting ? (
        <div className="flex flex-col gap-3">
          <p className="type-caption text-ink-subtle">
            {armed ? "Press again to start." : "Hold to record · Tap to arm."}
          </p>
          <MicPrimer />
        </div>
      ) : null}

      {live ? (
        <p className="type-caption text-ink-subtle">
          {paused ? "Paused. Nothing is saved yet." : "Recording. Nothing is saved yet."}
        </p>
      ) : null}

      {state.autoStopped ? (
        <p className="type-body-sm measure text-ink-muted">
          That is the longest a single take can be, so it stopped at{" "}
          {formatDuration(MAX_RECORDING_MS / 1000)}. Your recording is here.
        </p>
      ) : null}

      <div className="mt-auto flex flex-col">
        {backingTrack ? (
          <TrackRow
            track={backingTrack}
            error={track.error}
            onRetry={track.retry}
            onClear={onClearTrack}
            disabled={live || counting}
          />
        ) : (
          <RailRow>
            <button
              type="button"
              onClick={onChooseTrack}
              disabled={live || counting}
              className="type-body-sm w-full text-left text-ink disabled:opacity-55"
            >
              Sing over a track
            </button>
          </RailRow>
        )}

        <RailRow>
          <Switch
            label="I'm in a noisy room"
            description="Cleans up what you hear while you record. Your recording keeps the original sound."
            checked={preferences.noisyRoom}
            onCheckedChange={toggleNoisyRoom}
          />
        </RailRow>
        {suppressorFailed ? (
          <p className="type-caption py-2 text-ink-subtle">
            This browser could not run the noise filter, so you are hearing the raw input.
          </p>
        ) : null}

        <RailRow>
          <Switch
            label="Hear yourself"
            description={
              latencyMs !== null
                ? `Use headphones. What you hear is about ${latencyMs}ms behind you.`
                : "Use headphones, or the speakers will feed back into the take."
            }
            checked={preferences.monitoring}
            onCheckedChange={toggleMonitoring}
          />
        </RailRow>

        <RailRow>
          <Switch
            label="Count me in"
            description="Three beats before recording starts."
            checked={preferences.countdown}
            onCheckedChange={(on) => setRecordPreferences({ countdown: on })}
          />
        </RailRow>

        {!preferences.headphonesHintSeen && !live ? (
          <RailRow>
            <div className="flex items-center justify-between gap-4">
              <p className="type-body-sm measure text-ink-muted">
                Best with headphones. Speakers leak into the microphone.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRecordPreferences({ headphonesHintSeen: true })}
              >
                Got it
              </Button>
            </div>
          </RailRow>
        ) : null}

        <RailRow>
          <button
            type="button"
            onClick={onUpload}
            disabled={live || counting}
            className="type-body-sm flex w-full items-center gap-3 text-left text-ink disabled:opacity-55"
          >
            <Upload className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
            Upload a file instead
          </button>
        </RailRow>
      </div>
    </section>
  );
}

/**
 * One 44px row hung on the rail with a hairline above it. Not a card, not a
 * settings tile with a coloured icon (§12.1, §12.28).
 */
function RailRow({ children }: { children: ReactNode }) {
  return <div className="border-t border-hairline py-3">{children}</div>;
}

function TrackRow({
  track,
  error,
  onRetry,
  onClear,
  disabled,
}: {
  track: RecordStageBackingTrack;
  error: string | null;
  onRetry: () => void;
  onClear: () => void;
  disabled: boolean;
}) {
  return (
    <div className="border-t border-hairline py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="type-subhead truncate text-ink">{track.title}</p>
          <p className="type-caption truncate text-ink-subtle">{track.artistCredit}</p>
        </div>
        <IconButton
          label="Remove this track"
          icon={<X className="size-4" />}
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={disabled}
        />
      </div>
      {error ? (
        <div className="mt-2 flex items-center gap-4">
          <p className="type-caption text-signal-deep">{error}</p>
          <Button variant="ghost" size="xs" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function announce(status: string, autoStopped: boolean, interrupted: boolean): string {
  switch (status) {
    case "requesting":
      return "Asking for the microphone.";
    case "recording":
      return "Recording.";
    case "paused":
      return "Paused.";
    case "stopped":
      if (interrupted) return "Recording stopped because the page was hidden. Your take is kept.";
      return autoStopped ? "Recording stopped at the maximum length." : "Recording finished.";
    case "error":
      return "Recording failed.";
    default:
      return "";
  }
}
