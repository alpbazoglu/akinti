"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { routes } from "@/config/routes";

import { TraceRow, type TraceRowWave } from "./TraceRow";

export interface OpenCall {
  readonly waveId: string;
  /** The creator's own words about what they want back. */
  readonly prompt: string | null;
  readonly deadlineAt: string | null;
  readonly wave: TraceRowWave;
}

export interface OpenCallsLaneProps {
  calls: readonly OpenCall[];
}

/**
 * Open calls (SCREENS.md §3, PRODUCT_V2 §4).
 *
 * A creator has marked one of their own Waves "anyone can record with this",
 * so answering skips the request-and-wait round trip entirely. The lane hangs
 * on the rail like every other stream, plays where it stands, and quotes the
 * ask in the creator's own words.
 *
 * The open-for-Duet mark is the one non-playing place Signal is allowed to
 * appear, because it denotes audio availability (§4.1, SCREENS.md §3).
 */
export function OpenCallsLane({ calls }: OpenCallsLaneProps) {
  const t = useTranslations("OpenCallsLane");
  const tTerms = useTranslations("Terms");

  if (calls.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="open-calls" className="flex flex-col gap-4 pt-8">
      <h2 id="open-calls" className="akinti-page type-caption-strong flex items-center gap-2 text-ink-muted">
        <span aria-hidden="true" className="size-2 rounded-label bg-signal" />
        {t("openCalls")}
      </h2>

      <div className="flex flex-col">
        {calls.map((call) => (
          <div key={call.waveId} className="akinti-page">
            <TraceRow wave={call.wave} />
            <div className="akinti-rail pb-4">
              <div />
              <div className="flex min-w-0 flex-col items-start gap-3">
                {call.prompt ? (
                  <p className="type-body-sm measure text-ink-muted">“{call.prompt}”</p>
                ) : null}
                <Link
                  href={routes.waveDuet(call.waveId)}
                  className="akinti-press inline-flex h-10 items-center rounded-key border border-hairline-strong px-4 type-subhead text-ink transition-colors hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
                >
                  {t("answerThisCall")}
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="akinti-page type-caption text-ink-subtle">
        {t("answeringDescription", { duet: tTerms("duet") })}
      </p>
    </section>
  );
}
