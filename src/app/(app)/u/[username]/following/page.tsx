
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout";
import { FollowerList, LockedContent } from "@/components/profile";
import { EmptyState } from "@/components/ui";
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
  const t = await getTranslations("Terms");
  return { title: `${t("following")} · @${username}` };
}

/** `/u/[username]/following` (spec §21). Same visibility rule as the profile's Waves tab. */
export default async function FollowingPage({ params }: FollowingPageProps) {
  const { username } = await params;
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("FollowingPage");

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={t("following")} />
        <EmptyState title={tPage("backendNotConfiguredTitle")} description={tPage("backendNotConfiguredDescription")} />
      </>
    );
  }

  const supabase = await createServerSupabaseClient();
  const viewerUser = await getCurrentUser();
  const profile = await getProfileByUsername(supabase, username);

  if (!profile) {
    return (
      <>
        <PageHeader title={t("following")} />
        <EmptyState title={tPage("unavailableTitle")} description={tPage("unavailableDescription")} />
      </>
    );
  }

  const isSelf = viewerUser?.id === profile.id;
  const canSeeContent = isSelf || (await canViewProfileContent(supabase, profile.id));

  return (
    <>
      <PageHeader title={t("following")} />
      {canSeeContent ? (
        <div className="px-4 pb-8 sm:px-5">
          <FollowerList
            profiles={(await listFollowing(supabase, profile.id)).items}
            emptyTitle={tPage("emptyTitle")}
            emptyDescription={isSelf ? tPage("emptySelf") : tPage("emptyOther", { username: profile.username })}
          />
        </div>
      ) : (
        <LockedContent username={profile.username} />
      )}
    </>
  );
}
