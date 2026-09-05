import { redirect } from "next/navigation";
import { Handshake } from "lucide-react";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { DuetRecorder } from "@/components/duet";
import { getAudioAssetById } from "@/lib/db/audioAssets";
import { getDuetRequestById } from "@/lib/db/duetRequests";
import { resolveWavePeaks } from "@/lib/audio/peaks";
import { getProfileById } from "@/lib/db/profiles";
import { getWaveById } from "@/lib/db/waves";
import { requireUser } from "@/lib/auth/server";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface DuetRecordPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ request?: string }>;
}

export async function generateMetadata({ params }: DuetRecordPageProps) {
  const { id } = await params;
  return { title: `Record your ${TERMS.duet} · ${TERMS.wave} ${id}` };
}

/**
 * `/w/[id]/duet/record?request=<id>` (spec §15 deliverable 3). Requester
 * only, and only once the request is `ACCEPTED` — every check here is a
 * courtesy; the real authority is `publishDuetWave`
 * (`src/app/(app)/create/duetActions.ts`) re-verifying the same three facts
 * server-side, and `waves_guard_insert` (migration 12) re-verifying them a
 * third time independently at the database level before the Duet Wave can
 * even be inserted.
 */
export default async function DuetRecordPage({ params, searchParams }: DuetRecordPageProps) {
  const { id } = await params;
  const { request: requestId } = await searchParams;
  const user = await requireUser(requestId ? routes.duetRecord(id, requestId) : routes.waveDuet(id));

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={`Record your ${TERMS.duet}`} />
        <EmptyState
          icon={<Handshake className="size-6" />}
          title="This isn't connected to a backend yet"
          description="Supabase environment variables aren't set, so Duets can't be recorded here."
        />
      </>
    );
  }

  if (!requestId) {
    return <UnavailableState description="This link is missing its Duet Request. Start from your Duet Requests inbox." />;
  }

  const db = await createServerSupabaseClient();
  const request = await getDuetRequestById(db, requestId);

  if (!request || request.waveId !== id) {
    return <UnavailableState description="That Duet Request could not be found for this Wave." />;
  }
  if (request.requesterId !== user.id) {
    return <UnavailableState description="Only the person who requested this Duet can record it." />;
  }
  if (request.resultingWaveId) {
    redirect(routes.wave(request.resultingWaveId));
  }
  if (request.status !== "accepted") {
    return (
      <UnavailableState
        description={
          request.status === "pending"
            ? "This Duet Request hasn't been accepted yet."
            : "This Duet Request is no longer active."
        }
      />
    );
  }

  const originalWave = await getWaveById(db, request.waveId);
  const original = originalWave ? await getAudioAssetById(db, originalWave.audioAssetId) : null;

  if (!originalWave || !original) {
    return <UnavailableState description="The original Wave is no longer available." />;
  }

  const creator = await getProfileById(db, originalWave.creatorId);

  return (
    <>
      <PageHeader
        title={`Record your ${TERMS.duet}`}
        description={`Against "${originalWave.title}" by @${creator?.username ?? "unknown"}`}
      />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-24 sm:px-5">
        <DuetRecorder
          requestId={request.id}
          originalAssetId={original.id}
          originalTitle={originalWave.title}
          originalCreatorUsername={creator?.username ?? "unknown"}
          originalPeaks={resolveWavePeaks(original.peaks?.data, original.id)}
          originalDurationMs={original.durationMs ?? 0}
        />
      </div>
    </>
  );
}

function UnavailableState({ description }: { description: string }) {
  return (
    <>
      <PageHeader title={`Record your ${TERMS.duet}`} />
      <EmptyState icon={<Handshake className="size-6" />} title="Can't record this Duet right now" description={description} />
    </>
  );
}
