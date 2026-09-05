"use client";

/**
 * "Enter an existing Wave" (spec item 4). `docs/CHALLENGES.md` documents
 * `enterChallengeAction` as ready but says "a composer flow for actually
 * entering a Wave from the UI is a later agent's screen work" — this is that
 * screen. "Enter with a new Wave" is a separate link on
 * `src/app/(app)/challenges/[slug]/page.tsx` to `routes.create({ challenge })`
 * — `/create` now resolves the `challenge` param server-side, preselects its
 * backing track and enters it automatically after publish.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { enterChallengeAction } from "@/app/(app)/challenges/actions";
import { Button, ErrorState, Sheet } from "@/components/ui";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { timeAgo } from "@/lib/ui";

export interface EnterChallengeWaveOption {
  readonly id: string;
  readonly title: string;
  readonly publishedAt: string;
}

export interface EnterChallengeWavePickerProps {
  challengeId: string;
  challengeSlug: string;
  waves: readonly EnterChallengeWaveOption[];
  className?: string;
}

export function EnterChallengeWavePicker({
  challengeId,
  challengeSlug,
  waves,
  className,
}: EnterChallengeWavePickerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleEnter = (waveId: string) => {
    setError(null);
    setEnteringId(waveId);
    startTransition(async () => {
      const result = await enterChallengeAction({ challengeId, waveId, challengeSlug });
      if (!result.ok) {
        setError(result.formError ?? "We couldn't enter this challenge. Try again.");
        setEnteringId(null);
        return;
      }
      setOpen(false);
      setEnteringId(null);
      router.refresh();
    });
  };

  return (
    <div className={className}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {TERMS.enterExistingWave}
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title={TERMS.enterExistingWave}>
        <div className="flex flex-col gap-4">
          {error ? <ErrorState size="sm" title="Couldn't enter this challenge" description={error} /> : null}

          {waves.length === 0 ? (
            <p className="type-body-sm measure text-ink-muted">
              You don&apos;t have a published {TERMS.wave.toLowerCase()} yet. Record one from{" "}
              <a href={routes.create()} className="text-ink underline">
                {TERMS.create}
              </a>
              , then come back to enter it.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
              {waves.map((wave) => (
                <li key={wave.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="type-subhead truncate text-ink">{wave.title}</span>
                    <span className="type-caption text-ink-subtle">{timeAgo(wave.publishedAt)}</span>
                  </span>
                  <Button
                    size="sm"
                    loading={isPending && enteringId === wave.id}
                    disabled={isPending}
                    onClick={() => handleEnter(wave.id)}
                  >
                    {TERMS.enterChallenge}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>
    </div>
  );
}
