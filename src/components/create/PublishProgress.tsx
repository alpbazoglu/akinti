"use client";

import { Button } from "@/components/ui";
import { cn } from "@/lib/ui";

/**
 * Publish stages, in order. Each is a real step with a real boundary, not a
 * slice of an invented percentage.
 */
export type PublishStage = "uploading" | "checking" | "queued" | "done";

export const PUBLISH_STAGES: readonly Exclude<PublishStage, "done">[] = [
  "uploading",
  "checking",
  "queued",
];

const STAGE_LABEL: Record<Exclude<PublishStage, "done">, string> = {
  uploading: "Sending your recording",
  checking: "Checking it arrived",
  queued: "Queued for polishing",
};

export interface PublishProgressProps {
  stage: PublishStage;
  /** Set when a stage failed. The recording is never lost. */
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

/**
 * Honest upload state (`mobile-guidelines.md` rules 36-38, §12.38: never
 * optimistic UI on audio upload).
 *
 * Three named stages on the rail, each marked done, running or waiting. There
 * is deliberately **no percentage**: the browser reports nothing usable for a
 * signed-URL upload, and a bar that crawls to 90% and stops is the single most
 * common lie in this category. There is also no progress bar with a filled
 * grey track (§12.30) — the marks are the state.
 *
 * A failure names the stage that failed, says the recording is still here, and
 * offers a retry that resumes from the top (spec §38).
 */
export function PublishProgress({ stage, error, onRetry, className }: PublishProgressProps) {
  const currentIndex = stage === "done" ? PUBLISH_STAGES.length : PUBLISH_STAGES.indexOf(stage);

  return (
    <section className={cn("flex flex-col gap-4", className)} aria-live="polite">
      <ol className="flex flex-col">
        {PUBLISH_STAGES.map((item, index) => {
          const done = index < currentIndex;
          const running = index === currentIndex && !error;
          const failed = index === currentIndex && Boolean(error);

          return (
            <li key={item} className="akinti-rail items-center border-t border-hairline py-3">
              <span className="flex justify-end" aria-hidden="true">
                <StageMark done={done} running={running} failed={failed} />
              </span>
              <span
                className={cn(
                  "type-body-sm",
                  done || running ? "text-ink" : "text-ink-subtle",
                  failed && "text-signal-deep",
                )}
              >
                {STAGE_LABEL[item]}
              </span>
            </li>
          );
        })}
      </ol>

      {error ? (
        <div className="flex flex-col gap-3 border-t border-hairline pt-4">
          <p className="type-body-sm measure text-ink">{error}</p>
          <p className="type-caption measure text-ink-subtle">Your recording is still here.</p>
          {onRetry ? (
            <div>
              <Button onClick={onRetry}>Try again</Button>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="type-caption measure text-ink-subtle">
          Polishing happens after this, on our side. You can watch it on the Wave.
        </p>
      )}
    </section>
  );
}

/**
 * The stage mark: a filled ink square when done, a half-opacity ink square
 * while running, a hairline tick while waiting. Publishing is not audio
 * state, so it never reaches for Signal (§12.3), and it never loops — the
 * record lamp is the one infinite animation this product has (§12.34).
 */
function StageMark({
  done,
  running,
  failed,
}: {
  done: boolean;
  running: boolean;
  failed: boolean;
}) {
  if (failed) return <span className="size-2 bg-signal-deep" />;
  if (done) return <span className="size-2 bg-ink" />;
  if (running) return <span className="size-2 bg-ink opacity-55" />;
  return <span className="h-px w-2 bg-hairline-strong" />;
}
