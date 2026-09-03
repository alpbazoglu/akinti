import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { routes } from "@/config/routes";
import { Avatar } from "@/components/ui";
import type { Profile } from "@/types/domain";

export interface ThreadHeaderProps {
  otherProfile: Profile | null;
}

/** Sticky thread header: back to the inbox (mobile), other member's avatar/name (spec §22 deliverable 3). */
export function ThreadHeader({ otherProfile }: ThreadHeaderProps) {
  const name = otherProfile ? (otherProfile.displayName ?? `@${otherProfile.username}`) : "Conversation";

  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface px-3 py-2.5 sm:px-5">
      <Link
        href={routes.messages()}
        aria-label="Back to Messages"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:hidden"
      >
        <ArrowLeft className="size-5" aria-hidden="true" />
      </Link>

      {otherProfile ? (
        <Link
          href={routes.profile(otherProfile.username)}
          className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Avatar name={name} src={otherProfile.avatarUrl} size="sm" />
          <span className="truncate text-sm font-semibold text-fg">{name}</span>
        </Link>
      ) : (
        <span className="truncate text-sm font-semibold text-fg">{name}</span>
      )}
    </div>
  );
}
