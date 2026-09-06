import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/ui";

export interface LockedContentProps {
  username: string;
  /** True when the viewer has a pending follow request in, for slightly different copy. */
  requested?: boolean;
}

/**
 * Shown instead of the Waves/Duets tabs when the viewer cannot see this
 * account's content (spec §21 — private profile, not-yet-accepted
 * follower). The identity card above this (avatar, name, bio, counts)
 * stays visible per `can_view_profile` — only the content itself locks.
 */
export async function LockedContent({ username, requested = false }: LockedContentProps) {
  const t = await getTranslations("LockedContent");
  const tTerms = await getTranslations("Terms");
  const waves = tTerms("waves");
  const duets = tTerms("duets");

  return (
    <EmptyState
      title={t("title")}
      description={
        requested
          ? t("pending", { username, waves, duets })
          : t("notFollowing", { username, waves, duets })
      }
    />
  );
}
