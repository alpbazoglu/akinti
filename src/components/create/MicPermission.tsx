"use client";

import { useTranslations } from "next-intl";
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
  const t = useTranslations("MicPermission");
  return (
    <p className={cn("type-caption measure text-ink-subtle", className)}>{t("micPrimer")}</p>
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

type MicPermissionTranslator = ReturnType<typeof useTranslations<"MicPermission">>;

/**
 * The recovery steps, per browser and OS. Pure aside from `t`, so the
 * mapping is readable and so nothing here depends on rendering.
 */
export function recoveryFor(platform: Platform, engine: Engine, t: MicPermissionTranslator): Recovery {
  if (platform === "ios") {
    if (engine === "safari" || engine === "other") {
      return {
        title: t("iosSafariTitle"),
        steps: [
          t("iosSafariStep1"),
          t("iosSafariStep2"),
          t("iosSafariStep3"),
          t("iosSafariStep4"),
        ],
      };
    }
    return {
      title: t("iosOtherTitle"),
      steps: [t("iosOtherStep1"), t("iosOtherStep2"), t("iosOtherStep3")],
    };
  }

  if (platform === "android") {
    return {
      title: t("androidTitle"),
      steps: [t("androidStep1"), t("androidStep2"), t("androidStep3")],
    };
  }

  if (engine === "safari") {
    return {
      title: t("macSafariTitle"),
      steps: [t("macSafariStep1"), t("macSafariStep2"), t("macSafariStep3")],
    };
  }

  if (engine === "firefox") {
    return {
      title: t("firefoxTitle"),
      steps: [t("firefoxStep1"), t("firefoxStep2"), t("firefoxStep3")],
    };
  }

  return {
    title: engine === "edge" ? t("edgeTitle") : t("chromeTitle"),
    steps: [t("chromiumStep1"), t("chromiumStep2"), t("chromiumStep3")],
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
  const t = useTranslations("MicPermission");
  // `MicDenied` only ever mounts client-side, after `getUserMedia` has
  // already resolved to "denied" — it is never present in server-rendered
  // markup, so reading `navigator` in the lazy initializer (rather than in
  // an effect) carries no hydration-mismatch risk and avoids a synchronous
  // `setState` inside an effect body.
  const [recovery] = useState<Recovery>(() => {
    const { platform, engine } = detect();
    return recoveryFor(platform, engine, t);
  });

  return (
    // `lg:max-w-md`: unlike the two-column stages, this is plain text and
    // steps — `CreateFlow`'s container drops its `max-w-xl` cap at desktop
    // for those, so a fallback screen like this one needs its own bound
    // rather than stretching edge to edge.
    <section className={cn("flex flex-col gap-6 lg:max-w-md", className)}>
      <div className="flex flex-col gap-2">
        <h2 className="type-heading text-ink">{t("micNeeded")}</h2>
        <p className="type-body-sm measure text-ink-muted">{t("canStillUpload")}</p>
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
          {t("tryMicAgain")}
        </Button>
        <Button variant="ghost" onClick={onUpload}>
          {t("uploadInstead")}
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
  const t = useTranslations("MicPermission");
  return (
    <section className={cn("flex flex-col gap-6 lg:max-w-md", className)}>
      <div className="flex flex-col gap-2">
        <h2 className="type-heading text-ink">{t("browserCannotRecord")}</h2>
        <p className="type-body-sm measure text-ink-muted">
          {reason ?? t("recordingNeedsMic")} {t("supportedBrowsers")}
        </p>
      </div>
      <Button onClick={onUpload} size="lg">
        {t("uploadInstead")}
      </Button>
    </section>
  );
}
