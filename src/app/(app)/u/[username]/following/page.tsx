import { UserX } from "lucide-react";

import { PageHeader } from "@/components/layout";
import { FollowerList, LockedContent } from "@/components/profile";
import { EmptyState } from "@/components/ui";
import { TERMS } from "@/config/terminology";
import { getCurrentUser } from "@/lib/auth/server";
import { listFollowing } from "@/lib/db/follows";
import { canViewProfileContent, getProfileByUsername } from "@/lib/db/profiles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface FollowingPageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: FollowingPageProps) {
  const { username } = await params;
  return { title: `${TERMS.following} · @${username}` };
}

/** `/u/[username]/following` (spec §21). Same visibility rule as the profile's Waves tab. */
export default async function FollowingPage({ params }: FollowingPageProps) {
  const { username } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={TERMS.following} />
        <EmptyState title="Backend not configured" description="Following lists are unavailable in this environment." />
      </>
    );
  }

  const supabase = await createServerSupabaseClient();
  const viewerUser = await getCurrentUser();
  const profile = await getProfileByUsername(supabase, username);

  if (!profile) {
    return (
      <>
        <PageHeader title={TERMS.following} />
        <EmptyState icon={<UserX className="size-6" />} title="Profile unavailable" description="This profile doesn't exist, or isn't available to you." />
      </>
    );
  }

  const isSelf = viewerUser?.id === profile.id;
  const canSeeContent = isSelf || (await canViewProfileContent(supabase, profile.id));

  return (
    <>
      <PageHeader title={TERMS.following} description={`Accounts @${profile.username} follows.`} />
      {canSeeContent ? (
        <div className="px-4 pb-8 sm:px-5">
          <FollowerList
            profiles={(await listFollowing(supabase, profile.id)).items}
            emptyTitle="Not following anyone yet"
            emptyDescription={isSelf ? "Accounts you follow will show up here." : `@${profile.username} isn't following anyone yet.`}
          />
        </div>
      ) : (
        <LockedContent username={profile.username} />
      )}
    </>
  );
}
