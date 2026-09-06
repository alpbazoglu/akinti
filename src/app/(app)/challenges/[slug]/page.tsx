import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { ChallengeBackingTrack, ChallengeEntriesGrid, EnterChallengeWavePicker } from "@/components/challenges";
import { getCurrentUser } from "@/lib/auth/server";
import { getBackingTrackById } from "@/lib/db/backingTracks";
import {
  deriveChallengePhase,
  getChallengeBySlug,
  listChallengeEntries,
  listChallengePicks,
  localizeChallenge,
} from "@/lib/db/challenges";
import { getWavesByIds, listProfileWaves } from "@/lib/db/waves";
import { hydrateWaveCards } from "@/lib/feed";
import { routes } from "@/config/routes";
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
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("ChallengePage");
  const locale = await getLocale();

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={t("challenge")} />
        <EmptyState
          title={tPage("notConnectedTitle")}
          description={tPage("notConnectedDescription")}
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
  // Hydrated to full `WaveCardContainerWave` shape (creator, peaks, saved
  // state) — the desktop entries grid needs the whole card; the mobile
  // title-only rows below just read `.title` off the same fetch rather than
  // hitting the database twice for the same Waves.
  const cards = await hydrateWaveCards(db, waves, viewer?.id ?? null);
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const entryCards = entryPage.items
    .map((entry) => cardById.get(entry.waveId))
    .filter((card): card is NonNullable<typeof card> => card !== undefined);

  const phase = deriveChallengePhase(challenge);

  // "Enter an existing Wave" only makes sense while the challenge is
  // actually open for entries (`can_enter_challenge` requires `status ===
  // 'live'`, independent of the calendar `phase` above) and for a signed-in
  // viewer with something to enter.
  const eligibleWaves =
    viewer && challenge.status === "live"
      ? (await listProfileWaves(db, viewer.id, { limit: 50 })).items
      : [];

  const { title, brief } = localizeChallenge(challenge, locale);

  return (
    <>
      <PageHeader title={title} />
      {/* Two-column at desktop (this pass's brief, item 1: "detail page
          two-column — brief + track left, entries right"). `lg:grid`
          overrides the mobile `flex flex-col` only from `lg` up, so mobile's
          DOM and classes are otherwise untouched; column placement (not DOM
          order) is what puts entries on the right regardless of where the
          Top 5 section falls in source order. */}
      <div className="akinti-page flex flex-col gap-8 pb-16 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-10">
        <div className="flex flex-col gap-8 lg:col-start-1">
          <div className="flex flex-col gap-2">
            <Link href={routes.hashtag(challenge.hashtag)} className="type-subhead text-ink hover:underline">
              #{challenge.hashtag}
            </Link>
            <p className="type-body measure whitespace-pre-line text-ink">{brief}</p>
            <p className="type-body-sm text-ink-muted">
              {phase === "upcoming" ? tPage("starts") : phase === "ended" ? tPage("ended") : tPage("ends")}{" "}
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
                  {tPage("enterWithNewWave")}
                </Link>
              </div>
            ) : null}
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="type-caption-strong text-ink-muted">{t("topFive")}</h2>
            {picks.length === 0 ? (
              <p className="type-body-sm text-ink-muted">{tPage("noPicksYet")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
                {picks.map((pick) => {
                  const card = cardById.get(pick.waveId);
                  if (!card) return null;
                  return (
                    <li key={pick.id}>
                      <Link
                        href={routes.wave(card.id)}
                        className="flex items-baseline gap-3 py-3 hover:bg-paper-raised"
                      >
                        <span className="type-mono-sm text-ink-muted">{pick.rank}</span>
                        <span className="type-body text-ink">{card.title}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <section className="flex flex-col gap-3 lg:col-start-2 lg:row-start-1">
          <h2 className="type-caption-strong text-ink-muted">{tPage("entriesHeading")}</h2>
          {entryPage.items.length === 0 ? (
            <p className="type-body-sm text-ink-muted">{tPage("noEntriesYet")}</p>
          ) : (
            <ChallengeEntriesGrid entries={entryCards} />
          )}
          {entryPage.nextCursor ? (
            <Link
              href={`${routes.challenge(challenge.slug)}?entriesCursor=${encodeURIComponent(entryPage.nextCursor)}`}
              className="type-body-sm self-start text-ink underline"
            >
              {tPage("olderEntries")}
            </Link>
          ) : null}
        </section>
      </div>
    </>
  );
}
