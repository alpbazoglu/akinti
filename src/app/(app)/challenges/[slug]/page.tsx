import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { ChallengeBackingTrack, EnterChallengeWavePicker } from "@/components/challenges";
import { getCurrentUser } from "@/lib/auth/server";
import { getBackingTrackById } from "@/lib/db/backingTracks";
import {
  deriveChallengePhase,
  getChallengeBySlug,
  listChallengeEntries,
  listChallengePicks,
} from "@/lib/db/challenges";
import { getWavesByIds, listProfileWaves } from "@/lib/db/waves";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface ChallengePageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ entriesCursor?: string }>;
}

const ENTRIES_PAGE_SIZE = 20;

/**
 * `/challenges/[slug]` — one weekly theme: brief, the curated Top 5, and
 * recent entries. Minimal, server-rendered (screens are a later agent's
 * job); entering a Wave happens via `enterChallengeAction`
 * (`src/app/(app)/challenges/actions.ts`) from whatever composer surface
 * that later work wires up — this page only displays.
 */
export default async function ChallengePage({ params, searchParams }: ChallengePageProps) {
  const { slug } = await params;
  const { entriesCursor } = await searchParams;

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

  const [picks, entryPage, backingTrack, viewer] = await Promise.all([
    listChallengePicks(db, challenge.id),
    listChallengeEntries(db, challenge.id, { limit: ENTRIES_PAGE_SIZE, cursor: entriesCursor ?? null }),
    challenge.backingTrackId ? getBackingTrackById(db, challenge.backingTrackId) : Promise.resolve(null),
    getCurrentUser(),
  ]);

  const waveIds = [...new Set([...picks.map((p) => p.waveId), ...entryPage.items.map((e) => e.waveId)])];
  const waves = await getWavesByIds(db, waveIds);
  const waveById = new Map(waves.map((w) => [w.id, w]));

  const phase = deriveChallengePhase(challenge);

  // "Enter an existing Wave" only makes sense while the challenge is
  // actually open for entries (`can_enter_challenge` requires `status ===
  // 'live'`, independent of the calendar `phase` above) and for a signed-in
  // viewer with something to enter.
  const eligibleWaves =
    viewer && challenge.status === "live"
      ? (await listProfileWaves(db, viewer.id, { limit: 50 })).items
      : [];

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

          {backingTrack ? (
            <ChallengeBackingTrack
              assetId={backingTrack.audioAssetId}
              title={backingTrack.title}
              artistCredit={backingTrack.artistCredit}
              durationMs={backingTrack.durationMs}
            />
          ) : null}

          {viewer && challenge.status === "live" ? (
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <EnterChallengeWavePicker
                challengeId={challenge.id}
                challengeSlug={challenge.slug}
                waves={eligibleWaves.map((wave) => ({ id: wave.id, title: wave.title, publishedAt: wave.publishedAt }))}
              />
              <Link
                href={routes.create({ challenge: challenge.slug })}
                className="type-body-sm text-ink underline"
              >
                Enter with a new Wave
              </Link>
            </div>
          ) : null}
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
          {entryPage.nextCursor ? (
            <Link
              href={`${routes.challenge(challenge.slug)}?entriesCursor=${encodeURIComponent(entryPage.nextCursor)}`}
              className="type-body-sm self-start text-ink underline"
            >
              Older entries
            </Link>
          ) : null}
        </section>
      </div>
    </>
  );
}
