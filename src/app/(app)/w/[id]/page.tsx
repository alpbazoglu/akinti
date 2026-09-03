import Link from "next/link";
import { AudioLines, Handshake } from "lucide-react";

import { PageHeader } from "@/components/layout";
import { CommentsSection } from "@/components/comments";
import { Badge, EmptyState } from "@/components/ui";
import { WaveCardContainer, type WaveCardContainerWave } from "@/components/wave";
import { getAudioAssetById } from "@/lib/db/audioAssets";
import { getProfileById, getProfilesByIds } from "@/lib/db/profiles";
import { isWaveSaved } from "@/lib/db/saves";
import {
  getWaveById,
  listDirectDuets,
  listWaveCollaborators,
} from "@/lib/db/waves";
import { getCurrentUser } from "@/lib/auth/server";
import { routes } from "@/config/routes";
import { CREATION_TYPES, TERMS } from "@/config/terminology";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cn, timeAgo } from "@/lib/ui";
import type { Collaborator, CollaboratorStatus, Profile, Wave } from "@/types/domain";

import { getCommentPermissionState, loadComments } from "./interactions";
import { ProcessingBanner } from "./ProcessingBanner";
import { WaveOwnerMenu } from "./WaveOwnerMenu";

interface WavePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: WavePageProps) {
  const { id } = await params;
  return { title: `${TERMS.wave} ${id}` };
}

const COLLABORATOR_STATUS_TONE: Record<CollaboratorStatus, "success" | "warning" | "neutral"> = {
  accepted: "success",
  pending: "warning",
  declined: "neutral",
};

const COLLABORATOR_STATUS_LABEL: Record<CollaboratorStatus, string> = {
  accepted: "Accepted",
  pending: "Invited",
  declined: "Declined",
};

/** Wave detail: the full card, creation type, collaborators and the Duet tree that grew from it (spec §11, §15). */
export default async function WavePage({ params }: WavePageProps) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={TERMS.wave} />
        <EmptyState
          icon={<AudioLines className="size-6" />}
          title="This isn't connected to a backend yet"
          description="Supabase environment variables aren't set, so Waves can't be loaded here."
        />
      </>
    );
  }

  const db = await createServerSupabaseClient();
  const [wave, viewer] = await Promise.all([getWaveById(db, id), getCurrentUser()]);

  if (!wave) {
    return <UnavailableState />;
  }

  const [
    asset,
    creator,
    allCollaborators,
    directDuets,
    hasSaved,
    canRequestDuetResult,
    commentsResult,
    commentPermission,
  ] = await Promise.all([
    getAudioAssetById(db, wave.audioAssetId),
    getProfileById(db, wave.creatorId),
    listWaveCollaborators(db, wave.id),
    listDirectDuets(db, wave.id, { limit: 12 }),
    viewer ? isWaveSaved(db, viewer.id, wave.id) : Promise.resolve(false),
    db.rpc("can_request_duet", { p_wave_id: wave.id }),
    loadComments(wave.id, null),
    getCommentPermissionState(wave.id),
  ]);
  const initialComments =
    commentsResult.ok && commentsResult.data ? commentsResult.data : { items: [], nextCursor: null };

  if (!asset || !creator) {
    // Data integrity edge case (a Wave with no readable creator/asset) —
    // treated the same as "unavailable" rather than a 500.
    return <UnavailableState />;
  }

  const isCreator = viewer?.id === wave.creatorId;
  const canRequestDuet = !isCreator && canRequestDuetResult.data === true;

  const [parentWave, originalWave] = await Promise.all([
    wave.duet.parentWaveId ? getWaveById(db, wave.duet.parentWaveId) : Promise.resolve(null),
    wave.duet.originalWaveId && wave.duet.originalWaveId !== wave.duet.parentWaveId
      ? getWaveById(db, wave.duet.originalWaveId)
      : Promise.resolve(null),
  ]);

  const lineageCreatorIds = [parentWave?.creatorId, originalWave?.creatorId].filter(
    (creatorId): creatorId is string => Boolean(creatorId),
  );
  const duetCreatorIds = directDuets.items.map((duetWave) => duetWave.creatorId);
  const collaboratorProfileIds = allCollaborators.map((c) => c.profileId);

  const relatedProfiles = await getProfilesByIds(db, [
    ...new Set([...lineageCreatorIds, ...duetCreatorIds, ...collaboratorProfileIds]),
  ]);
  const profileById = new Map(relatedProfiles.map((p) => [p.id, p]));

  const acceptedCollaboratorPeople = allCollaborators
    .filter((c) => c.status === "accepted")
    .map((c) => profileById.get(c.profileId))
    .filter((p): p is Profile => Boolean(p))
    .map((p) => ({ username: p.username, displayName: p.displayName ?? undefined, avatarUrl: p.avatarUrl }));

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
    collaborators: acceptedCollaboratorPeople,
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
    canRequestDuet,
  };

  return (
    <>
      <PageHeader
        title={TERMS.wave}
        description={`By @${creator.username}`}
        actions={isCreator ? <WaveOwnerMenu wave={wave} redirectAfterDeleteHref={routes.profile(creator.username)} /> : undefined}
      />

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-16 sm:px-5">
        <ProcessingBanner
          assetId={asset.id}
          initialStatus={asset.processingStatus}
          initialError={asset.processingError}
        />

        <WaveCardContainer wave={cardWave} />

        <CommentsSection
          waveId={wave.id}
          waveCreatorId={wave.creatorId}
          initialComments={initialComments}
          initialPermission={commentPermission}
          initialCommentCount={wave.counts.comments}
        />

        {(parentWave || originalWave) && (
          <DuetLineage
            parentWave={parentWave}
            originalWave={originalWave}
            profileById={profileById}
          />
        )}

        {allCollaborators.length > 0 ? (
          <CollaboratorsSection collaborators={allCollaborators} profileById={profileById} />
        ) : null}

        {directDuets.items.length > 0 ? (
          <DuetsList waves={directDuets.items} profileById={profileById} />
        ) : null}
      </div>
    </>
  );
}

function UnavailableState() {
  return (
    <>
      <PageHeader title={TERMS.wave} />
      <EmptyState
        icon={<AudioLines className="size-6" />}
        title={`This ${TERMS.wave.toLowerCase()} isn't available`}
        description="It may have been deleted, made private, or the link is wrong."
      />
    </>
  );
}

interface DuetLineageProps {
  parentWave: Wave | null;
  originalWave: Wave | null;
  profileById: Map<string, Profile>;
}

function DuetLineage({ parentWave, originalWave, profileById }: DuetLineageProps) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-sm">
      <h2 className="flex items-center gap-1.5 font-semibold text-fg">
        <Handshake className="size-4" aria-hidden="true" />
        {TERMS.duet} lineage
      </h2>
      {parentWave ? (
        <LineageLink label={`${TERMS.duet} of`} wave={parentWave} profile={profileById.get(parentWave.creatorId)} />
      ) : null}
      {originalWave ? (
        <LineageLink label="Original" wave={originalWave} profile={profileById.get(originalWave.creatorId)} />
      ) : null}
    </section>
  );
}

function LineageLink({
  label,
  wave,
  profile,
}: {
  label: string;
  wave: Wave;
  profile?: Profile;
}) {
  return (
    <p className="text-fg-muted">
      {label}{" "}
      <Link href={routes.wave(wave.id)} className="font-medium text-fg hover:underline">
        {wave.title}
      </Link>
      {profile ? (
        <>
          {" "}by{" "}
          <Link href={routes.profile(profile.username)} className="text-fg hover:underline">
            @{profile.username}
          </Link>
        </>
      ) : null}
    </p>
  );
}

function CollaboratorsSection({
  collaborators,
  profileById,
}: {
  collaborators: readonly Collaborator[];
  profileById: Map<string, Profile>;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-fg">{TERMS.collaborators}</h2>
      <ul className="flex flex-col gap-2">
        {collaborators.map((collaborator) => {
          const profile = profileById.get(collaborator.profileId);
          return (
            <li key={collaborator.id} className="flex items-center justify-between gap-2 text-sm">
              {profile ? (
                <Link href={routes.profile(profile.username)} className="font-medium text-fg hover:underline">
                  @{profile.username}
                </Link>
              ) : (
                <span className="text-fg-muted">Unknown</span>
              )}
              <Badge tone={COLLABORATOR_STATUS_TONE[collaborator.status]}>
                {COLLABORATOR_STATUS_LABEL[collaborator.status]}
              </Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DuetsList({
  waves,
  profileById,
}: {
  waves: readonly Wave[];
  profileById: Map<string, Profile>;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-fg">
        {TERMS.duets} ({waves.length})
      </h2>
      <ul className="flex flex-col gap-2">
        {waves.map((duetWave) => {
          const profile = profileById.get(duetWave.creatorId);
          const meta = CREATION_TYPES[duetWave.creationType];
          return (
            <li key={duetWave.id}>
              <Link
                href={routes.wave(duetWave.id)}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm",
                  "hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-fg">{duetWave.title}</span>
                  <span className="truncate text-xs text-fg-subtle">
                    {profile ? `@${profile.username}` : "Unknown"} &middot; {timeAgo(duetWave.publishedAt)}
                  </span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-fg-subtle">
                  {meta.glyph}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
