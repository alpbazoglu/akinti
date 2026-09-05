"use client";

/**
 * The A/B engine behind "Sounds like" (`docs/design/SCREENS.md` §4.4).
 *
 * The screen's own note is the whole design brief: *"A/B is the primary
 * interaction here, not the preset list. It sits above the list and keeps
 * playing across the switch (no restart) — that continuity is the whole
 * point."* You cannot hear what a compressor did if the audio restarts every
 * time you compare, so both branches run permanently off one
 * `MediaElementAudioSourceNode` and the toggle is a gain crossfade, not a
 * graph swap and not a seek.
 *
 *   element -> source ┬-> originalGain ---------------┬-> destination
 *                     └-> [polish chain] -> polishGain┘
 *
 * Changing preset while polished audio is playing rebuilds only the polished
 * branch, behind its own gain, and crossfades onto it: the audio never stops,
 * and there is never a moment where both the old and the new chain are
 * audible at full level.
 *
 * `createMediaElementSource` may be called at most once per element, so the
 * source is memoised against the element it was built from. `AudioContext` is
 * created lazily inside the play gesture, per `mobile-guidelines.md` rule 24.
 */

import type { AdvancedEqSettings, EnhancementPresetId } from "../enhancement";

import { buildPolishGraph, describePolishGraph } from "./graph";

export type PolishMode = "original" | "polished";

/**
 * Crossfade length. Short enough to read as "the same moment, processed
 * differently"; long enough that a gain step does not click.
 */
const CROSSFADE_SECONDS = 0.09;

interface PolishBranch {
  /** The node `source` feeds, kept so the branch can be detached wholesale. */
  readonly head: GainNode;
  readonly out: GainNode;
}

export class PolishPreview {
  private context: AudioContext | null = null;
  private element: HTMLAudioElement | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private originalGain: GainNode | null = null;
  private branch: PolishBranch | null = null;

  private mode: PolishMode = "polished";
  private preset: EnhancementPresetId = "natural";
  private advancedEq: AdvancedEqSettings | null = null;

  /**
   * True once the graph is live. `false` means this browser would not give us
   * a `AudioContext` — the screen then plays the original only and says so,
   * rather than pretending the toggle works.
   */
  get isReady(): boolean {
    return this.source !== null;
  }

  /**
   * Build the graph around `element`. Must be called from a user gesture.
   * Returns `false` when Web Audio is unavailable.
   */
  connect(element: HTMLAudioElement): boolean {
    if (this.source && this.element === element) return true;
    if (this.element && this.element !== element) this.destroy();

    const context = this.ensureContext();
    if (!context) return false;

    try {
      const source = context.createMediaElementSource(element);
      const originalGain = context.createGain();
      originalGain.gain.value = this.mode === "original" ? 1 : 0;
      source.connect(originalGain);
      originalGain.connect(context.destination);

      this.element = element;
      this.source = source;
      this.originalGain = originalGain;
      this.rebuildBranch(this.mode === "polished" ? 1 : 0);
      return true;
    } catch {
      this.destroy();
      return false;
    }
  }

  /** Resume a context the autoplay policy suspended. Call inside the gesture. */
  async resume(): Promise<void> {
    const context = this.context;
    if (context && context.state === "suspended") {
      await context.resume().catch(() => {});
    }
  }

  /** Swap branches without restarting playback. */
  setMode(mode: PolishMode): void {
    this.mode = mode;
    const context = this.context;
    if (!context || !this.originalGain || !this.branch) return;

    const now = context.currentTime;
    const fade = (gain: GainNode, target: number) => {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(target, now + CROSSFADE_SECONDS);
    };

    fade(this.originalGain, mode === "original" ? 1 : 0);
    fade(this.branch.out, mode === "polished" ? 1 : 0);
  }

  get currentMode(): PolishMode {
    return this.mode;
  }

  /**
   * Change the sound. Rebuilds the polished branch in place; if polished
   * audio is currently playing, the new chain fades in as the old fades out.
   */
  setPreset(preset: EnhancementPresetId, advancedEq: AdvancedEqSettings | null): void {
    if (preset === this.preset && advancedEq === this.advancedEq) return;
    this.preset = preset;
    this.advancedEq = advancedEq;
    if (this.source) this.rebuildBranch(this.mode === "polished" ? 1 : 0);
  }

  /** Tear the whole graph down and close the context. Idempotent. */
  destroy(): void {
    this.detachBranch();
    this.originalGain?.disconnect();
    this.source?.disconnect();
    this.originalGain = null;
    this.source = null;
    this.element = null;
    const context = this.context;
    this.context = null;
    if (context) void Promise.resolve(context.close()).catch(() => {});
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof window === "undefined") return null;
    const Ctor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.context = new Ctor();
    } catch {
      this.context = null;
    }
    return this.context;
  }

  private rebuildBranch(targetGain: number): void {
    const context = this.context;
    const source = this.source;
    if (!context || !source) return;

    const previous = this.branch;

    // `head` exists purely so the finished branch can be detached with one
    // `source.disconnect(head)` later; without it the first chain node would
    // have to be tracked by hand for every spec shape.
    const head = context.createGain();
    head.gain.value = 1;
    source.connect(head);

    const end = buildPolishGraph(context, head, describePolishGraph(this.preset, this.advancedEq));

    const out = context.createGain();
    out.gain.value = previous ? 0 : targetGain;
    end.connect(out);
    out.connect(context.destination);

    this.branch = { head, out };

    if (!previous) return;

    const now = context.currentTime;
    previous.out.gain.cancelScheduledValues(now);
    previous.out.gain.setValueAtTime(previous.out.gain.value, now);
    previous.out.gain.linearRampToValueAtTime(0, now + CROSSFADE_SECONDS);
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(targetGain, now + CROSSFADE_SECONDS);

    // Detach the old branch only after its fade-out has finished, so the swap
    // is inaudible rather than a gap.
    const stale = previous;
    window.setTimeout(
      () => {
        try {
          source.disconnect(stale.head);
          stale.out.disconnect();
        } catch {
          // Context already closed.
        }
      },
      Math.ceil(CROSSFADE_SECONDS * 1000) + 20,
    );
  }

  private detachBranch(): void {
    const branch = this.branch;
    this.branch = null;
    if (!branch) return;
    try {
      this.source?.disconnect(branch.head);
      branch.out.disconnect();
    } catch {
      // Context already closed.
    }
  }
}
