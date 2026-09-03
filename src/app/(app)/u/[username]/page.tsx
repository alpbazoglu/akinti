import { User } from "lucide-react";

import { TERMS } from "@/config/terminology";

import { PlaceholderPage } from "../../_components/PlaceholderPage";

interface ProfilePageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: ProfilePageProps) {
  const { username } = await params;
  return { title: `@${username}` };
}

/** Creator profile with Waves and Duets tabs (spec 21). */
export default async function ProfilePage({ params }: ProfilePageProps) {
  const { username } = await params;

  return (
    <PlaceholderPage
      title={`@${username}`}
      description={`${TERMS.waves}, ${TERMS.duets}, ${TERMS.followers} and ${TERMS.following}.`}
      icon={<User className="size-6" />}
      emptyTitle={`No ${TERMS.waves} yet`}
      emptyDescription={`Profiles arrive with the profile stage. Visibility is enforced server-side: a private profile is never readable by guessing this URL.`}
    />
  );
}
