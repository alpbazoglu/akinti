
import { PageHeader } from "@/components/layout";
import { FollowerList, LockedContent } from "@/components/profile";
import { EmptyState } from "@/components/ui";
import { TERMS } from "@/config/terminology";
import { getCurrentUser } from "@/lib/auth/server";
import { listFollowers } from "@/lib/db/follows";
import { canViewProfileContent, getProfileByUsername } from "@/lib/db/profiles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface FollowersPageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: FollowersPageProps) {
  const { username } = await params;
  return { title: `${TERMS.followers} · @${username}` };
}

/** `/u/[username]/followers` (spec §21). Same visibility rule as the profile's Waves tab. */
export default async function FollowersPage({ params }: FollowersPageProps) {
  const { username } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={TERMS.followers} />
        <EmptyState title="Backend not configured" description="Follower lists are unavailable in this environment." />
      </>
    );
  }

  const supabase = await createServerSupabaseClient();
  const viewerUser = await getCurrentUser();
  const profile = await getProfileByUsername(supabase, username);

  if (!profile) {
    return (
      <>
        <PageHeader title={TERMS.followers} />
        <EmptyState title="Profile unavailable" description="This profile doesn't exist, or isn't available to you." />
      </>
    );
  }

  const isSelf = viewerUser?.id === profile.id;
  const canSeeContent = isSelf || (await canViewProfileContent(supabase, profile.id));

  return (
    <>
      <PageHeader title={TERMS.followers} />
      {canSeeContent ? (
        <div className="px-4 pb-8 sm:px-5">
          <FollowerList
            profiles={(await listFollowers(supabase, profile.id)).items}
            emptyTitle="No followers yet"
            emptyDescription={isSelf ? "Once people follow you, they'll show up here." : `@${profile.username} doesn't have any followers yet.`}
          />
        </div>
      ) : (
        <LockedContent username={profile.username} />
      )}
    </>
  );
}
