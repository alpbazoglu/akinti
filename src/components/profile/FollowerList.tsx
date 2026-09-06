import Link from "next/link";

import { routes } from "@/config/routes";
import type { Profile } from "@/types/domain";
import { Avatar, EmptyState } from "@/components/ui";

export interface FollowerListProps {
  profiles: Profile[];
  emptyTitle: string;
  emptyDescription: string;
}

/** Shared list body for `/u/[username]/followers` and `/following` (spec §21). */
export function FollowerList({ profiles, emptyTitle, emptyDescription }: FollowerListProps) {
  if (profiles.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
      {profiles.map((profile) => (
        <li key={profile.id}>
          <Link
            href={routes.profile(profile.username)}
            className="flex items-center gap-3 px-4 py-3 hover:bg-paper-sunk focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            <Avatar name={profile.displayName ?? profile.username} src={profile.avatarUrl} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">
                {profile.displayName ?? profile.username}
              </p>
              <p className="truncate text-xs text-fg-subtle">@{profile.username}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
