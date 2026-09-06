"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { unblockUser } from "@/app/(app)/settings/actions";
import { routes } from "@/config/routes";
import type { Profile } from "@/types/domain";
import { Avatar, Button, EmptyState, useToast } from "@/components/ui";

export interface BlockedListProps {
  blocked: Profile[];
}

/** Settings → Safety: blocked users, with unblock (spec §25/§26). */
export function BlockedList({ blocked }: BlockedListProps) {
  const t = useTranslations("BlockedList");
  const [entries, setEntries] = useState(blocked);

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
    <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
      {entries.map((profile) => (
        <BlockedRow
          key={profile.id}
          profile={profile}
          onUnblocked={() => setEntries((current) => current.filter((p) => p.id !== profile.id))}
        />
      ))}
    </ul>
  );
}

function BlockedRow({ profile, onUnblocked }: { profile: Profile; onUnblocked: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("BlockedList");
  const tTerms = useTranslations("Terms");
  const [isPending, startTransition] = useTransition();

  function handleUnblock() {
    startTransition(async () => {
      const result = await unblockUser(profile.id);
      if (!result.ok) {
        toast({ title: result.formError ?? t("couldNotUnblock"), tone: "error" });
        return;
      }
      onUnblocked();
      toast({ title: result.message ?? t("unblocked"), tone: "success" });
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
      <Button variant="secondary" size="sm" onClick={handleUnblock} loading={isPending}>
        {tTerms("unblock")}
      </Button>
    </li>
  );
}
