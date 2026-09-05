"use client";

import { useState } from "react";

import { Button } from "@/components/ui";
import { cn } from "@/lib/ui";

/**
 * What to say when the microphone is not available
 * (`docs/research/mobile-guidelines.md` rules 3, 4 and "Denied state is a real
 * screen with recovery steps").
 *
 * Three surfaces, and none of them is a modal:
 *
 * - `MicPrimer` — one line under the record key, before the browser's own
 *   dialog ever fires, saying what the microphone is for and what happens to
 *   the audio. Not a screen, not a dialog, not a second call to action
 *   (§12.40): the record key is still the only thing to press.
 * - `MicDenied` — a real screen with the actual click path for the browser the
 *   person is using, plus the honest alternative (upload a file you already
 *   have). "Check your settings" is not recovery.
 * - `MicUnsupported` — for a browser that cannot record at all, which is a
 *   different problem from a refused permission and gets a different answer.
 *
 * Steps are left-aligned on the rail with no icon in a grey circle above
 * centred text (§12.5).
 */

export interface MicPrimerProps {
  className?: string;
}

export function MicPrimer({ className }: MicPrimerProps) {
  return (
    <p className={cn("type-caption measure text-ink-subtle", className)}>
      We need your mic to record. Nothing is uploaded until you publish.
    </p>
  );
}

type Platform = "ios" | "android" | "macos" | "windows" | "other";
type Engine = "safari" | "chrome" | "firefox" | "edge" | "other";

interface Recovery {
  readonly title: string;
  readonly steps: readonly string[];
}

/** Reads the UA once, on the client, to pick the right click path. */
function detect(): { platform: Platform; engine: Engine } {
  if (typeof navigator === "undefined") return { platform: "other", engine: "other" };
  const ua = navigator.userAgent;
  const touch = navigator.maxTouchPoints ?? 0;

  const platform: Platform = /iPad|iPhone|iPod/i.test(ua)
    ? "ios"
    : /Android/i.test(ua)
      ? "android"
      : /Macintosh/i.test(ua)
        ? touch > 1
          ? "ios"
          : "macos"
        : /Windows/i.test(ua)
          ? "windows"
          : "other";

  const engine: Engine = /Edg\//i.test(ua)
    ? "edge"
    : /Firefox|FxiOS/i.test(ua)
      ? "firefox"
      : /Chrom(e|ium)|CriOS/i.test(ua)
        ? "chrome"
        : /Safari/i.test(ua)
          ? "safari"
          : "other";

  return { platform, engine };
}

/**
 * The recovery steps, per browser and OS. Pure, so the mapping is readable
 * and so nothing here depends on rendering.
 */
export function recoveryFor(platform: Platform, engine: Engine): Recovery {
  if (platform === "ios") {
    if (engine === "safari" || engine === "other") {
      return {
        title: "In Safari on iPhone or iPad",
        steps: [
          "Tap the page settings button in the address bar.",
          "Choose Website Settings, then set Microphone to Allow.",
          "Open Settings, then Safari, then Microphone, and allow it there too.",
          "Come back and press record again.",
        ],
      };
    }
    return {
      title: "On iPhone or iPad",
      steps: [
        "Open Settings, then Privacy and Security, then Microphone.",
        "Turn the microphone on for this browser.",
        "Come back and press record again.",
      ],
    };
  }

  if (platform === "android") {
    return {
      title: "On Android",
      steps: [
        "Tap the lock or tune icon in the address bar.",
        "Open Permissions and allow the microphone.",
        "Reload the page and press record again.",
      ],
    };
  }

  if (engine === "safari") {
    return {
      title: "In Safari on Mac",
      steps: [
        "Open Safari, then Settings, then Websites, then Microphone.",
        "Set this site to Allow.",
        "Reload the page and press record again.",
      ],
    };
  }

  if (engine === "firefox") {
    return {
      title: "In Firefox",
      steps: [
        "Click the microphone icon in the address bar.",
        "Remove the block, then reload the page.",
        "Press record and choose Allow.",
      ],
    };
  }

  return {
    title: engine === "edge" ? "In Edge" : "In Chrome",
    steps: [
      "Click the lock or tune icon at the left of the address bar.",
      "Set Microphone to Allow.",
      "Reload the page and press record again.",
    ],
  };
}

export interface MicDeniedProps {
  /** Try `getUserMedia` again once the user says they have fixed it. */
  onRetry: () => void;
  /** Takes them to the upload path, which needs no microphone. */
  onUpload: () => void;
  className?: string;
}

export function MicDenied({ onRetry, onUpload, className }: MicDeniedProps) {
  // `MicDenied` only ever mounts client-side, after `getUserMedia` has
  // already resolved to "denied" — it is never present in server-rendered
  // markup, so reading `navigator` in the lazy initializer (rather than in
  // an effect) carries no hydration-mismatch risk and avoids a synchronous
  // `setState` inside an effect body.
  const [recovery] = useState<Recovery>(() => {
    const { platform, engine } = detect();
    return recoveryFor(platform, engine);
  });

  return (
    <section className={cn("flex flex-col gap-6", className)}>
      <div className="flex flex-col gap-2">
        <h2 className="type-heading text-ink">
          AKINTI needs the microphone to record.
        </h2>
        <p className="type-body-sm measure text-ink-muted">
          You can still upload audio you already have.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="type-caption-strong text-ink-muted">{recovery.title}</p>
        <ol className="flex flex-col gap-2">
          {recovery.steps.map((step, index) => (
            <li key={step} className="akinti-rail items-baseline">
              <span className="type-mono-sm text-right text-ink-subtle">{index + 1}</span>
              <span className="type-body-sm measure text-ink">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <Button onClick={onRetry} size="lg">
          Try the microphone again
        </Button>
        <Button variant="ghost" onClick={onUpload}>
          Upload a file instead
        </Button>
      </div>
    </section>
  );
}

export interface MicUnsupportedProps {
  onUpload: () => void;
  /** The recorder's own message, when it had one. */
  reason?: string | null;
  className?: string;
}

export function MicUnsupported({ onUpload, reason, className }: MicUnsupportedProps) {
  return (
    <section className={cn("flex flex-col gap-6", className)}>
      <div className="flex flex-col gap-2">
        <h2 className="type-heading text-ink">This browser cannot record audio.</h2>
        <p className="type-body-sm measure text-ink-muted">
          {reason ?? "Recording needs a microphone and a browser that supports it."} Safari on
          iPhone, Chrome on Android and any recent desktop browser all work.
        </p>
      </div>
      <Button onClick={onUpload} size="lg">
        Upload a file instead
      </Button>
    </section>
  );
}
