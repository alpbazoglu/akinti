
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout";
import { LockedContent, ProfileHeader, ProfileTabs } from "@/components/profile";
import { EmptyState } from "@/components/ui";
import { SIGNATURE_SOURCE_LIMIT, composeSignature, deriveGenreHue } from "@/components/feed";
import type { WaveCardContainerWave } from "@/components/wave";
import { getCurrentUser } from "@/lib/auth/server";
import { isPro } from "@/lib/billing/entitlements";
import { getFollowStatus, isFollowing } from "@/lib/db/follows";
import { canViewProfileContent, getProfileByUsername } from "@/lib/db/profiles";
import { listProfileDuetCards, listProfileWaveCards, type ProfileWaveCard } from "@/lib/db/profileWaves";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PermissionAudience, Profile, Wave } from "@/types/domain";

interface ProfilePageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: ProfilePageProps) {
  const { username } = await params;
  return { title: `@${username}` };
}

/**
 * Wraps `isPro` in a real try/catch — `createAdminClient()` throws
 * synchronously when `SUPABASE_SERVICE_ROLE_KEY` is unset, which a plain
 * `.catch()` on the resulting promise would not catch (the throw happens
 * before the promise even exists), and this must never crash the profile
 * page for every visitor over one missing badge.
 */
async function resolveProfileIsPro(profileId: string): Promise<boolean> {
  try {
    return await isPro(createAdminClient(), profileId);
  } catch {
    return false;
  }
}

/** Best-effort UI hint only — `can_request_duet` (server-side) is the real gate. */
function resolveCanRequestDuet(
  wave: Wave,
  profile: Profile,
  isSelf: boolean,
  viewerId: string | null,
): boolean {
  if (isSelf || !viewerId) return false;
  const audience: PermissionAudience = wave.duetPermission ?? profile.permissions.duet;
  return audience !== "nobody";
}

function toWaveCardWave(
  card: ProfileWaveCard,
  creator: { username: string; displayName: string | null; avatarUrl: string | null },
  canRequestDuet: boolean,
): WaveCardContainerWave {
  return {
    id: card.wave.id,
    title: card.wave.title,
    description: card.wave.description ?? undefined,
    createdAt: card.wave.publishedAt,
    creator: {
      username: creator.username,
      displayName: creator.displayName ?? undefined,
      avatarUrl: creator.avatarUrl,
    },
    collaborators: card.collaborators,
    creationType: card.wave.creationType,
    audioAssetId: card.audioAssetId,
    peaks: card.peaks,
    duration: card.durationMs ? card.durationMs / 1000 : undefined,
    metrics: card.wave.counts,
    canRequestDuet,
  };
}

/** Public profile (spec §21): header, theming, Follow/Message/Share/Block/Report, Waves/Duets tabs. */
export default async function ProfilePage({ params }: ProfilePageProps) {
  const { username } = await params;
  const t = await getTranslations("ProfilePage");

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={`@${username}`} />
        <EmptyState
          title={t("backendNotConfiguredTitle")}
          description={t("backendNotConfiguredDescription")}
        />
      </>
    );
  }

  const supabase = await createServerSupabaseClient();
  const viewerUser = await getCurrentUser();
  const profile = await getProfileByUsername(supabase, username);

  // Not found, or hidden by `can_view_profile` — indistinguishable on purpose
  // (a private/blocked account's existence is never confirmed to a caller
  // who cannot see it, spec §21/§26).
  if (!profile) {
    return (
      <>
        <PageHeader title={`@${username}`} />
        <EmptyState
          title={t("unavailableTitle")}
          description={t("unavailableDescription")}
        />
      </>
    );
  }

  const isSelf = viewerUser?.id === profile.id;
  const [followStatus, followsViewer, canSeeContent, profileIsPro] = await Promise.all([
    !isSelf && viewerUser ? getFollowStatus(supabase, viewerUser.id, profile.id) : Promise.resolve(null),
    !isSelf && viewerUser ? isFollowing(supabase, profile.id, viewerUser.id) : Promise.resolve(false),
    isSelf ? Promise.resolve(true) : canViewProfileContent(supabase, profile.id),
    // AKINTI Pro mark (Wave F, PRODUCT_V2 §5) — best-effort: a lookup failure
    // (e.g. Supabase configured without the Wave F migration applied yet, or
    // the service-role key missing) just hides the mark, never breaks the
    // profile page. Uses the admin client deliberately: `has_pro`'s `execute`
    // grant no longer includes `anon` (review3 finding 36 — an
    // unauthenticated caller had no legitimate reason to probe an arbitrary
    // user id's Pro status via a direct RPC call), but a signed-out visitor
    // viewing this very page still needs the same publicly-rendered badge a
    // signed-in viewer sees.
    resolveProfileIsPro(profile.id),
  ]);

  let waveCards: WaveCardContainerWave[] = [];
  let duetCards: WaveCardContainerWave[] = [];
  // Same Waves the signature is composed from, kept alongside it purely to
  // derive a genre tint (COLOR_V2 "Profile signature trace") — no extra
  // query, `Wave.tags` is already on every card `listProfileWaveCards` hands
  // back.
  let waveTagLists: readonly (readonly string[])[] = [];

  if (canSeeContent) {
    const creator = { username: profile.username, displayName: profile.displayName, avatarUrl: profile.avatarUrl };
    const [wavesPage, duetsPage] = await Promise.all([
      listProfileWaveCards(supabase, profile.id),
      listProfileDuetCards(supabase, profile.id),
    ]);
    waveCards = wavesPage.items.map((card) =>
      toWaveCardWave(card, creator, resolveCanRequestDuet(card.wave, profile, isSelf, viewerUser?.id ?? null)),
    );
    duetCards = duetsPage.items.map((card) =>
      toWaveCardWave(card, creator, resolveCanRequestDuet(card.wave, profile, isSelf, viewerUser?.id ?? null)),
    );
    waveTagLists = wavesPage.items.map((card) => card.wave.tags);
  }

  // The signature (SCREENS.md §8): a trace generated from this person's own
  // last 12 Waves, newest first — `waveCards` is already ordered that way,
  // so no extra query is needed beyond what the tabs already fetch.
  const signature = canSeeContent
    ? composeSignature(waveCards.slice(0, SIGNATURE_SOURCE_LIMIT).map((card) => card.peaks))
    : [];
  const signatureHue = canSeeContent
    ? deriveGenreHue(waveTagLists.slice(0, SIGNATURE_SOURCE_LIMIT))
    : undefined;

  return (
    <>
      <ProfileHeader
        profile={profile}
        signature={signature}
        hue={signatureHue}
        isPro={profileIsPro}
        viewer={{
          isSelf,
          isSignedIn: viewerUser !== null,
          followStatus,
          followsViewer,
          isBlockedByViewer: false, // reaching this page at all rules out the viewer having blocked them (can_view_profile hides it)
        }}
      />
      {canSeeContent ? (
        <ProfileTabs waves={waveCards} duets={duetCards} isSelf={isSelf} username={profile.username} />
      ) : (
        <LockedContent username={profile.username} requested={followStatus === "pending"} />
      )}
    </>
  );
}
