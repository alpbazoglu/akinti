import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

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
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface DuetRecordPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ request?: string }>;
}

export async function generateMetadata({ params }: DuetRecordPageProps) {
  const { id } = await params;
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("DuetRecordPage");
  return { title: `${tPage("recordYour", { duet: t("duet") })} · ${t("wave")} ${id}` };
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
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("DuetRecordPage");
  const recordYourDuetTitle = tPage("recordYour", { duet: t("duet") });

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={recordYourDuetTitle} />
        <EmptyState title={tPage("notConnectedTitle")} description={tPage("notConnectedDescription")} />
      </>
    );
  }

  if (!requestId) {
    return <UnavailableState description={tPage("missingRequestDescription")} />;
  }

  const db = await createServerSupabaseClient();
  const request = await getDuetRequestById(db, requestId);

  if (!request || request.waveId !== id) {
    return <UnavailableState description={tPage("requestNotFoundDescription")} />;
  }
  if (request.requesterId !== user.id) {
    return <UnavailableState description={tPage("notRequesterDescription")} />;
  }
  if (request.resultingWaveId) {
    redirect(routes.wave(request.resultingWaveId));
  }
  if (request.status !== "accepted") {
    return (
      <UnavailableState
        description={
          request.status === "pending"
            ? tPage("notAcceptedYetDescription")
            : tPage("noLongerActiveDescription")
        }
      />
    );
  }

  const originalWave = await getWaveById(db, request.waveId);
  const original = originalWave ? await getAudioAssetById(db, originalWave.audioAssetId) : null;

  if (!originalWave || !original) {
    return <UnavailableState description={tPage("originalUnavailableDescription")} />;
  }

  const creator = await getProfileById(db, originalWave.creatorId);

  return (
    <>
      <PageHeader
        title={recordYourDuetTitle}
      />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-24 sm:px-5">
        <DuetRecorder
          requestId={request.id}
          originalAssetId={original.id}
          originalTitle={originalWave.title}
          originalCreatorUsername={creator?.username ?? "unknown"}
          originalPeaks={resolveWavePeaks(original.peaks?.data, original.id, original.peaks?.bits)}
          originalDurationMs={original.durationMs ?? 0}
        />
      </div>
    </>
  );
}

async function UnavailableState({ description }: { description: string }) {
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("DuetRecordPage");
  return (
    <>
      <PageHeader title={tPage("recordYour", { duet: t("duet") })} />
      <EmptyState title={tPage("cantRecordTitle")} description={description} />
    </>
  );
}
