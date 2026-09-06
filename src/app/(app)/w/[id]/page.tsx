import Link from "next/link";

import { CommentsSection } from "@/components/comments";
import { PageHeader } from "@/components/layout";
import { InstallHint } from "@/components/pwa/InstallHint";
import { Avatar, Badge } from "@/components/ui";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { resolveWavePeaks } from "@/lib/audio/peaks";
import { getCurrentUser } from "@/lib/auth/server";
import { getAudioAssetById } from "@/lib/db/audioAssets";
import { getDuetTree } from "@/lib/db/duets";
import { getOpenCallByWaveId } from "@/lib/db/openCalls";
import { getProfileById, getProfilesByIds } from "@/lib/db/profiles";
import { isWaveSaved } from "@/lib/db/saves";
import { getWaveById, listDirectDuets, listWaveCollaborators } from "@/lib/db/waves";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/ui";
import type { CollaboratorStatus, DuetTreeNode, Profile, Wave } from "@/types/domain";

import { getCommentPermissionState, loadComments } from "./interactions";
import { OwnerInsights } from "./OwnerInsights";
import { ProcessingBanner } from "./ProcessingBanner";
import { WaveDetail, type WaveDetailWave } from "./WaveDetail";
import { WaveOwnerMenu } from "./WaveOwnerMenu";

/**
 * `WaveOwnerMenu` and `CommentsSection` were tried behind `next/dynamic`
 * here (same pattern as the `Sheet` fix, `src/components/ui/index.ts`), on
 * the theory that a Server-Component `dynamic()` (the only kind Next 16
 * allows outside a Client Component — `ssr: false` is rejected here) would
 * still give each its own chunk. Measured, it did not: `npm run perf`'s
 * union-of-reachable-chunks for `/w/[id]` came back *larger* (322.1KB vs
 * 320.2KB), and grepping the actual `page_client-reference-manifest.js`
 * showed `WaveOwnerMenu.tsx`/`CommentsSection.tsx` resolving to the exact
 * same 17-chunk set as every other module the route needs — Turbopack
 * co-locates everything a Server Component route always renders into one
 * per-route chunk group regardless of `dynamic()`, unlike the barrel-level
 * fix, which worked because *other* routes (`/login`, `/signup`) never
 * reference `Sheet` at all. Reverted; see `docs/qa/perf2/WATERFALL.md` for
 * the numbers and `WaveDetail.tsx`'s `ShareSheet` split (`ssr: false`,
 * possible there because it is inside a Client Component) for the one
 * `next/dynamic` change on this route that did measurably shrink the bundle.
 */

interface WavePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: WavePageProps) {
  const { id } = await params;
  const db = isSupabaseConfigured() ? await createServerSupabaseClient() : null;
  const wave = db ? await getWaveById(db, id) : null;
  return { title: wave?.title ?? TERMS.wave };
}

const COLLABORATOR_STATUS_LABEL: Record<CollaboratorStatus, string> = {
  accepted: "Accepted",
  pending: "Invited",
  declined: "Declined",
};

/**
 * The Wave detail (SCREENS.md §5).
 *
 * Everything about one Wave: the full trace, who made it, what they said
 * about it, what it grew into, and what anyone listening can do next. A Wave
 * that is gone, private or blocked says so in one sentence and offers the way
 * back, rather than rendering an empty shell.
 */
export default async function WavePage({ params }: WavePageProps) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return <UnavailableState />;
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
    commentsResult.ok && commentsResult.data
      ? commentsResult.data
      : { items: [], nextCursor: null };

  if (!asset || !creator) {
    // A Wave whose creator or audio the reader cannot see is treated exactly
    // like one that is gone: saying "it exists but you may not have it" is
    // itself a leak.
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

  // The chain view needs the `duet_tree` routine. Where it is not present the
  // page falls back to the direct Duets it can read for itself, rather than
  // failing the whole screen for a section. The open call is the creator's
  // own switch, so it is only read for them. None of these three reads
  // depend on each other, so they run together instead of one after the
  // other (docs/qa/perf2/WATERFALL.md).
  const chainRoot = wave.duet.originalWaveId ?? wave.id;
  const [relatedProfiles, chain, openCall] = await Promise.all([
    getProfilesByIds(db, [
      ...new Set([
        ...lineageCreatorIds,
        ...directDuets.items.map((duetWave) => duetWave.creatorId),
        ...allCollaborators.map((collaborator) => collaborator.profileId),
      ]),
    ]),
    getDuetTree(db, chainRoot)
      .then((tree) => tree.tree)
      .catch(() => [] as DuetTreeNode[]),
    isCreator ? getOpenCallByWaveId(db, wave.id).catch(() => null) : Promise.resolve(null),
  ]);
  const profileById = new Map(relatedProfiles.map((profile) => [profile.id, profile]));

  const detailWave: WaveDetailWave = {
    id: wave.id,
    title: wave.title,
    description: wave.description ?? undefined,
    publishedAt: wave.publishedAt,
    creator: {
      username: creator.username,
      displayName: creator.displayName ?? undefined,
      avatarUrl: creator.avatarUrl,
    },
    collaborators: allCollaborators
      .filter((collaborator) => collaborator.status === "accepted")
      .map((collaborator) => profileById.get(collaborator.profileId))
      .filter((profile): profile is Profile => Boolean(profile))
      .map((profile) => ({
        username: profile.username,
        displayName: profile.displayName ?? undefined,
        avatarUrl: profile.avatarUrl,
      })),
    creationType: wave.creationType,
    audioAssetId: asset.id,
    peaks: resolveWavePeaks(asset.peaks?.data, asset.id, asset.peaks?.bits),
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
    <div className="flex flex-col pb-12">
      {isCreator ? (
        <div className="akinti-page flex justify-end pt-4">
          <WaveOwnerMenu
            wave={wave}
            redirectAfterDeleteHref={routes.profile(creator.username)}
            openCallIsOpen={openCall?.isOpen ?? false}
            openCallPrompt={openCall?.prompt ?? null}
          />
        </div>
      ) : null}

      <div className="akinti-page pt-4 pb-2">
        <ProcessingBanner
          assetId={asset.id}
          initialStatus={asset.processingStatus}
          initialError={asset.processingError}
        />
      </div>

      <OwnerInsights isOwner={isCreator} audioAssetId={wave.audioAssetId} />

      <WaveDetail wave={detailWave}>
        {parentWave || originalWave ? (
          <Lineage
            parentWave={parentWave}
            originalWave={originalWave}
            profileById={profileById}
          />
        ) : null}

        {chain.length > 0 ? (
          <DuetChain nodes={chain} currentWaveId={wave.id} />
        ) : directDuets.items.length > 0 ? (
          <DirectDuets waves={directDuets.items} profileById={profileById} />
        ) : null}

        {allCollaborators.length > 0 ? (
          <section aria-labelledby="collaborators" className="flex flex-col pt-8">
            <h2 id="collaborators" className="akinti-page type-caption-strong pb-2 text-ink-muted">
              {TERMS.collaborators}
            </h2>
            <ul className="akinti-page flex flex-col divide-y divide-hairline border-t border-hairline">
              {allCollaborators.map((collaborator) => {
                const profile = profileById.get(collaborator.profileId);
                return (
                  <li
                    key={collaborator.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    {profile ? (
                      <Link
                        href={routes.profile(profile.username)}
                        className="type-subhead truncate text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                      >
                        @{profile.username}
                      </Link>
                    ) : (
                      <span className="type-body-sm text-ink-subtle">Not available</span>
                    )}
                    <Badge>{COLLABORATOR_STATUS_LABEL[collaborator.status]}</Badge>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </WaveDetail>

      <CommentsSection
        waveId={wave.id}
        waveCreatorId={wave.creatorId}
        initialComments={initialComments}
        initialPermission={commentPermission}
        initialCommentCount={wave.counts.comments}
      />

      <div className="akinti-page">
        <InstallHint />
      </div>
    </div>
  );
}

/** A Wave that is gone, private, or from someone the reader has blocked. */
function UnavailableState() {
  return (
    <>
      <PageHeader title={TERMS.wave} />
      <div className="akinti-page flex flex-col items-start gap-4">
        <p className="type-body measure text-ink">
          This {TERMS.wave} was removed by its creator, or it is not open to you.
        </p>
        <Link
          href={routes.home()}
          className="akinti-press inline-flex h-10 items-center rounded-key border border-hairline-strong px-4 type-subhead text-ink transition-colors hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Back to {TERMS.home}
        </Link>
      </div>
    </>
  );
}

interface LineageProps {
  parentWave: Wave | null;
  originalWave: Wave | null;
  profileById: Map<string, Profile>;
}

/** Where this Duet came from: the Wave it answers, and the one it started from. */
function Lineage({ parentWave, originalWave, profileById }: LineageProps) {
  return (
    <section aria-labelledby="lineage" className="flex flex-col pt-8">
      <h2 id="lineage" className="akinti-page type-caption-strong pb-2 text-ink-muted">
        Recorded with
      </h2>
      <div className="akinti-page flex flex-col divide-y divide-hairline border-t border-hairline">
        {parentWave ? (
          <LineageRow
            label={`${TERMS.duet} of`}
            wave={parentWave}
            profile={profileById.get(parentWave.creatorId)}
          />
        ) : null}
        {originalWave ? (
          <LineageRow
            label="Started from"
            wave={originalWave}
            profile={profileById.get(originalWave.creatorId)}
          />
        ) : null}
      </div>
    </section>
  );
}

function LineageRow({
  label,
  wave,
  profile,
}: {
  label: string;
  wave: Wave;
  profile?: Profile;
}) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 py-3">
      <span className="type-caption text-ink-subtle">{label}</span>
      <Link
        href={routes.wave(wave.id)}
        className="type-subhead text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {wave.title}
      </Link>
      {profile ? (
        <Link
          href={routes.profile(profile.username)}
          className="type-caption text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          @{profile.username}
        </Link>
      ) : null}
    </p>
  );
}

/**
 * The Duet chain: every Wave that grew from this one, in the order it grew.
 * Depth is drawn by indentation on the rail, not by a nested box.
 */
function DuetChain({ nodes, currentWaveId }: { nodes: readonly DuetTreeNode[]; currentWaveId: string }) {
  const flat = flattenChain(nodes, 0);
  return (
    <section aria-labelledby="duet-chain" className="flex flex-col pt-8">
      <h2 id="duet-chain" className="akinti-page type-caption-strong pb-2 text-ink-muted">
        {TERMS.duet} chain
      </h2>
      <ul className="akinti-page flex flex-col divide-y divide-hairline border-t border-hairline">
        {flat.map(({ node, depth }) => {
          const isCurrent = node.wave.id === currentWaveId;
          const name = node.creator.displayName ?? node.creator.username;
          return (
            <li key={node.wave.id} style={{ paddingLeft: `${Math.min(depth, 4) * 16}px` }}>
              <Link
                href={routes.wave(node.wave.id)}
                aria-current={isCurrent ? "page" : undefined}
                className="akinti-rail items-center py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
              >
                <Avatar name={name} src={node.creator.avatarUrl} size="sm" />
                <span className="flex min-w-0 flex-col">
                  <span className="type-subhead truncate text-ink">
                    {node.wave.title}
                    {isCurrent ? (
                      <span className="type-caption text-ink-subtle"> &middot; you are here</span>
                    ) : null}
                  </span>
                  <span className="type-caption truncate text-ink-subtle">
                    @{node.creator.username}
                    <span aria-hidden="true"> &middot; </span>
                    {timeAgo(node.wave.publishedAt)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function flattenChain(
  nodes: readonly DuetTreeNode[],
  depth: number,
): { node: DuetTreeNode; depth: number }[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flattenChain(node.children, depth + 1),
  ]);
}

/** The chain view's fallback: the Duets recorded directly against this Wave. */
function DirectDuets({
  waves,
  profileById,
}: {
  waves: readonly Wave[];
  profileById: Map<string, Profile>;
}) {
  return (
    <section aria-labelledby="direct-duets" className="flex flex-col pt-8">
      <h2 id="direct-duets" className="akinti-page type-caption-strong pb-2 text-ink-muted">
        {TERMS.duets} of this {TERMS.wave}
      </h2>
      <ul className="akinti-page flex flex-col divide-y divide-hairline border-t border-hairline">
        {waves.map((duetWave) => {
          const profile = profileById.get(duetWave.creatorId);
          const name = profile?.displayName ?? profile?.username ?? "";
          return (
            <li key={duetWave.id}>
              <Link
                href={routes.wave(duetWave.id)}
                className="akinti-rail items-center py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
              >
                <Avatar name={name} src={profile?.avatarUrl} size="sm" />
                <span className="flex min-w-0 flex-col">
                  <span className="type-subhead truncate text-ink">{duetWave.title}</span>
                  <span className="type-caption truncate text-ink-subtle">
                    {profile ? `@${profile.username}` : "Not available"}
                    <span aria-hidden="true"> &middot; </span>
                    {timeAgo(duetWave.publishedAt)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
