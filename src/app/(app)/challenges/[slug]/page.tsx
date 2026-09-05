import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import {
  deriveChallengePhase,
  getChallengeBySlug,
  listChallengeEntries,
  listChallengePicks,
} from "@/lib/db/challenges";
import { getWavesByIds } from "@/lib/db/waves";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface ChallengePageProps {
  params: Promise<{ slug: string }>;
}

const ENTRIES_PAGE_SIZE = 20;

/**
 * `/challenges/[slug]` — one weekly theme: brief, the curated Top 5, and
 * recent entries. Minimal, server-rendered (screens are a later agent's
 * job); entering a Wave happens via `enterChallengeAction`
 * (`src/app/(app)/challenges/actions.ts`) from whatever composer surface
 * that later work wires up — this page only displays.
 */
export default async function ChallengePage({ params }: ChallengePageProps) {
  const { slug } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={TERMS.challenge} />
        <EmptyState
          title="This isn't connected to a backend yet"
          description="Supabase environment variables aren't set, so this challenge can't be loaded here."
        />
      </>
    );
  }

  const db = await createServerSupabaseClient();
  const challenge = await getChallengeBySlug(db, slug);
  if (!challenge) {
    notFound();
  }

  const [picks, entryPage] = await Promise.all([
    listChallengePicks(db, challenge.id),
    listChallengeEntries(db, challenge.id, { limit: ENTRIES_PAGE_SIZE }),
  ]);

  const waveIds = [...new Set([...picks.map((p) => p.waveId), ...entryPage.items.map((e) => e.waveId)])];
  const waves = await getWavesByIds(db, waveIds);
  const waveById = new Map(waves.map((w) => [w.id, w]));

  const phase = deriveChallengePhase(challenge);

  return (
    <>
      <PageHeader title={challenge.title} />
      <div className="akinti-page flex flex-col gap-8 pb-16">
        <div className="flex flex-col gap-2">
          <Link href={routes.hashtag(challenge.hashtag)} className="type-subhead text-ink hover:underline">
            #{challenge.hashtag}
          </Link>
          <p className="type-body measure whitespace-pre-line text-ink">{challenge.brief}</p>
          <p className="type-body-sm text-ink-muted">
            {phase === "upcoming" ? "Starts" : phase === "ended" ? "Ended" : "Ends"}{" "}
            {new Date(phase === "upcoming" ? challenge.startsAt : challenge.endsAt).toLocaleDateString()}
          </p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="type-caption-strong text-ink-muted">{TERMS.topFive}</h2>
          {picks.length === 0 ? (
            <p className="type-body-sm text-ink-muted">No picks yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
              {picks.map((pick) => {
                const wave = waveById.get(pick.waveId);
                if (!wave) return null;
                return (
                  <li key={pick.id}>
                    <Link
                      href={routes.wave(wave.id)}
                      className="flex items-baseline gap-3 py-3 hover:bg-paper-raised"
                    >
                      <span className="type-mono-sm text-ink-muted">{pick.rank}</span>
                      <span className="type-body text-ink">{wave.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="type-caption-strong text-ink-muted">Entries</h2>
          {entryPage.items.length === 0 ? (
            <p className="type-body-sm text-ink-muted">No entries yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
              {entryPage.items.map((entry) => {
                const wave = waveById.get(entry.waveId);
                if (!wave) return null;
                return (
                  <li key={entry.id}>
                    <Link href={routes.wave(wave.id)} className="block py-3 type-body text-ink hover:bg-paper-raised">
                      {wave.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
