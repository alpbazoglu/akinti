
import { TERMS } from "@/config/terminology";
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
export function LockedContent({ username, requested = false }: LockedContentProps) {
  return (
    <EmptyState
      title="This profile is private"
      description={
        requested
          ? `Your follow request to @${username} is pending. Once accepted, you'll see their ${TERMS.waves} and ${TERMS.duets} here.`
          : `Follow @${username} to see their ${TERMS.waves} and ${TERMS.duets} once they accept.`
      }
    />
  );
}
