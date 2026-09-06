"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { acceptFollowRequest, declineFollowRequest } from "@/app/(app)/u/[username]/actions";
import { routes } from "@/config/routes";
import type { Profile } from "@/types/domain";
import { Avatar, Button, EmptyState, useToast } from "@/components/ui";

export interface FollowRequestsListProps {
  requests: Profile[];
}

/** `/settings/follow-requests`: accept or decline pending follow requests (spec §21). */
export function FollowRequestsList({ requests }: FollowRequestsListProps) {
  const t = useTranslations("FollowRequestsList");
  const [entries, setEntries] = useState(requests);

  if (entries.length === 0) {
    return (
      <EmptyState
        size="sm"
        title={t("emptyTitle")}
        description={t("emptyDescription")}
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {entries.map((profile) => (
        <RequestRow
          key={profile.id}
          profile={profile}
          onResolved={() => setEntries((current) => current.filter((p) => p.id !== profile.id))}
        />
      ))}
    </ul>
  );
}

function RequestRow({ profile, onResolved }: { profile: Profile; onResolved: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("FollowRequestsList");
  const [isPending, startTransition] = useTransition();

  function respond(accept: boolean) {
    startTransition(async () => {
      const result = accept
        ? await acceptFollowRequest(profile.id)
        : await declineFollowRequest(profile.id);
      if (!result.ok) {
        toast({ title: result.formError ?? t("couldNotUpdate"), tone: "error" });
        return;
      }
      onResolved();
      router.refresh();
    });
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Link href={routes.profile(profile.username)} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={profile.displayName ?? profile.username} src={profile.avatarUrl} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">
            {profile.displayName ?? profile.username}
          </p>
          <p className="truncate text-xs text-fg-subtle">@{profile.username}</p>
        </div>
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => respond(false)} disabled={isPending}>
          {t("decline")}
        </Button>
        <Button size="sm" onClick={() => respond(true)} loading={isPending}>
          {t("accept")}
        </Button>
      </div>
    </li>
  );
}
