import { Handshake } from "lucide-react";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { DuetRequestForm } from "@/components/duet";
import { WaveCardContainer, type WaveCardContainerWave } from "@/components/wave";
import { getAudioAssetById } from "@/lib/db/audioAssets";
import { canRequestDuet } from "@/lib/db/duetRequests";
import { getProfileById } from "@/lib/db/profiles";
import { isWaveSaved } from "@/lib/db/saves";
import { getWaveById } from "@/lib/db/waves";
import { requireUser } from "@/lib/auth/server";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface DuetRequestPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: DuetRequestPageProps) {
  const { id } = await params;
  return { title: `${TERMS.requestDuet} · ${TERMS.wave} ${id}` };
}

/**
 * `/w/[id]/duet` (spec §15 deliverable 1): shows the original Wave and a
 * message field, then sends a `duet_requests` row via `requestDuet`
 * (`./actions.ts`). The interactions agent's "Request a Duet" button on the
 * Wave card navigates here (see this agent's ownership note in the Stage 9
 * brief) rather than requesting inline.
 *
 * `requireUser` gates this even though `/w/` is in the proxy's public prefix
 * list (Wave visibility is enforced server-side, not by gating the route) —
 * requesting a Duet always requires a signed-in account, so this page
 * independently redirects (307) anonymous visitors to `/login`.
 */
export default async function DuetRequestPage({ params }: DuetRequestPageProps) {
  const { id } = await params;
  const user = await requireUser(routes.waveDuet(id));

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={TERMS.requestDuet} />
        <EmptyState
          icon={<Handshake className="size-6" />}
          title="This isn't connected to a backend yet"
          description="Supabase environment variables aren't set, so Duet Requests can't be sent here."
        />
      </>
    );
  }

  const db = await createServerSupabaseClient();
  const wave = await getWaveById(db, id);

  if (!wave) {
    return <UnavailableState />;
  }
  if (wave.creatorId === user.id) {
    return (
      <>
        <PageHeader title={TERMS.requestDuet} />
        <EmptyState
          icon={<Handshake className="size-6" />}
          title="This is your own Wave"
          description="You don't request a Duet on your own Wave — record one directly from it instead."
        />
      </>
    );
  }

  const [asset, creator, hasSaved, allowed] = await Promise.all([
    getAudioAssetById(db, wave.audioAssetId),
    getProfileById(db, wave.creatorId),
    isWaveSaved(db, user.id, wave.id),
    // The real, server-side authority (spec §15) — this page's own denial
    // state below is a courtesy, not the enforcement (`requestDuet` in
    // `./actions.ts` calls this same predicate again before writing anything).
    canRequestDuet(db, wave.id),
  ]);

  if (!asset || !creator) {
    return <UnavailableState />;
  }

  if (!allowed) {
    return (
      <>
        <PageHeader title={TERMS.requestDuet} />
        <EmptyState
          icon={<Handshake className="size-6" />}
          title="You can't request a Duet on this Wave"
          description="The creator may have Duets turned off for you, you may be blocked, the Wave may be private, or you already have a pending request for it."
        />
      </>
    );
  }

  const cardWave: WaveCardContainerWave = {
    id: wave.id,
    title: wave.title,
    description: wave.description ?? undefined,
    createdAt: wave.publishedAt,
    creator: {
      username: creator.username,
      displayName: creator.displayName ?? undefined,
      avatarUrl: creator.avatarUrl,
    },
    creationType: wave.creationType,
    audioAssetId: asset.id,
    peaks: asset.peaks?.data ?? [],
    duration: asset.durationMs ? asset.durationMs / 1000 : undefined,
    metrics: {
      plays: wave.counts.plays,
      replays: wave.counts.replays,
      comments: wave.counts.comments,
      saves: wave.counts.saves,
      shares: wave.counts.shares,
      duets: wave.counts.duets,
    },
    isSaved: hasSaved,
    // Already on the request flow — no reason to show a second, live
    // "Request a Duet" button on the preview card itself.
    canRequestDuet: false,
  };

  return (
    <>
      <PageHeader
        title={TERMS.requestDuet}
        description={`Send @${creator.username} a Duet Request for this ${TERMS.wave.toLowerCase()}.`}
      />

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-16 sm:px-5">
        <WaveCardContainer wave={cardWave} />
        <DuetRequestForm waveId={wave.id} />
      </div>
    </>
  );
}

function UnavailableState() {
  return (
    <>
      <PageHeader title={TERMS.requestDuet} />
      <EmptyState
        icon={<Handshake className="size-6" />}
        title={`This ${TERMS.wave.toLowerCase()} isn't available`}
        description="It may have been deleted, made private, or the link is wrong."
      />
    </>
  );
}
