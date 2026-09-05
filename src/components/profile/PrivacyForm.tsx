"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronRight } from "lucide-react";

import { updatePrivacy } from "@/app/(app)/settings/actions";
import { routes } from "@/config/routes";
import { useCurrentUser } from "@/lib/auth";
import {
  COMMENT_AUDIENCES,
  PERMISSION_AUDIENCES,
  WAVE_VISIBILITIES,
  type PermissionAudience,
  type ProfilePrivacy,
  type WaveVisibility,
} from "@/types/domain";
import { Badge, Select, Switch, useToast, type SelectOption } from "@/components/ui";

export interface PrivacyFormProps {
  initialPrivacy: ProfilePrivacy;
  initialMessagePermission: PermissionAudience;
  initialDuetPermission: PermissionAudience;
  initialCommentPermission: PermissionAudience;
  initialDefaultWaveVisibility: WaveVisibility;
  pendingFollowRequestCount: number;
}

const AUDIENCE_LABELS: Record<PermissionAudience, string> = {
  everyone: "Everyone",
  followers: "Followers",
  following: "People I follow",
  nobody: "Nobody",
};

const COMMENT_AUDIENCE_LABELS: Record<(typeof COMMENT_AUDIENCES)[number], string> = {
  everyone: "Everyone",
  followers: "Followers",
  nobody: "Nobody",
};

const VISIBILITY_LABELS: Record<WaveVisibility, string> = {
  everyone: "Everyone",
  followers: "Followers",
  only_me: "Only me",
};

const AUDIENCE_OPTIONS: SelectOption[] = PERMISSION_AUDIENCES.map((value) => ({
  value,
  label: AUDIENCE_LABELS[value],
}));
const COMMENT_AUDIENCE_OPTIONS: SelectOption[] = COMMENT_AUDIENCES.map((value) => ({
  value,
  label: COMMENT_AUDIENCE_LABELS[value],
}));
const VISIBILITY_OPTIONS: SelectOption[] = WAVE_VISIBILITIES.map((value) => ({
  value,
  label: VISIBILITY_LABELS[value],
}));

/** Settings → Privacy (spec §25): every account-level permission default, saved as soon as it changes. */
export function PrivacyForm({
  initialPrivacy,
  initialMessagePermission,
  initialDuetPermission,
  initialCommentPermission,
  initialDefaultWaveVisibility,
  pendingFollowRequestCount,
}: PrivacyFormProps) {
  const { refreshProfile } = useCurrentUser();
  const { toast } = useToast();
  const [privacy, setPrivacy] = useState<ProfilePrivacy>(initialPrivacy);
  const [messagePermission, setMessagePermission] = useState(initialMessagePermission);
  const [duetPermission, setDuetPermission] = useState(initialDuetPermission);
  const [commentPermission, setCommentPermission] = useState(initialCommentPermission);
  const [defaultWaveVisibility, setDefaultWaveVisibility] = useState(initialDefaultWaveVisibility);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(next: {
    privacy: ProfilePrivacy;
    messagePermission: PermissionAudience;
    duetPermission: PermissionAudience;
    commentPermission: PermissionAudience;
    defaultWaveVisibility: WaveVisibility;
  }) {
    setError(null);
    startTransition(async () => {
      const result = await updatePrivacy(next);
      if (!result.ok) {
        setError(result.formError ?? "Could not save your privacy settings.");
        return;
      }
      await refreshProfile();
      toast({ title: result.message ?? "Saved.", tone: "success" });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-surface p-5">
        <Switch
          label="Private account"
          description="Only accepted followers can see your Waves and follower list. Switching to private keeps everyone who already follows you."
          checked={privacy === "private"}
          onCheckedChange={(checked) => {
            const next = checked ? "private" : "public";
            setPrivacy(next);
            save({ privacy: next, messagePermission, duetPermission, commentPermission, defaultWaveVisibility });
          }}
          disabled={isPending}
        />
        {privacy === "private" ? (
          <Link
            href={routes.settingsFollowRequests()}
            className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="flex items-center gap-2 text-fg">
              Pending follow requests
              {pendingFollowRequestCount > 0 ? (
                <Badge tone="accent">{pendingFollowRequestCount}</Badge>
              ) : null}
            </span>
            <ChevronRight className="size-4 text-fg-subtle" aria-hidden="true" />
          </Link>
        ) : null}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-fg">Who can reach you</h2>
        <Select
          id="privacy-message-permission"
          label="Who can message me"
          value={messagePermission}
          onChange={(event) => {
            const next = event.target.value as PermissionAudience;
            setMessagePermission(next);
            save({ privacy, messagePermission: next, duetPermission, commentPermission, defaultWaveVisibility });
          }}
          options={AUDIENCE_OPTIONS}
          disabled={isPending}
        />
        <Select
          id="privacy-duet-permission"
          label="Who can send Duet Requests"
          value={duetPermission}
          onChange={(event) => {
            const next = event.target.value as PermissionAudience;
            setDuetPermission(next);
            save({ privacy, messagePermission, duetPermission: next, commentPermission, defaultWaveVisibility });
          }}
          options={AUDIENCE_OPTIONS}
          disabled={isPending}
        />
        <Select
          id="privacy-comment-permission"
          label="Who can comment on my Waves by default"
          value={commentPermission}
          onChange={(event) => {
            const next = event.target.value as PermissionAudience;
            setCommentPermission(next);
            save({ privacy, messagePermission, duetPermission, commentPermission: next, defaultWaveVisibility });
          }}
          options={COMMENT_AUDIENCE_OPTIONS}
          disabled={isPending}
          hint="Each Wave can override this when you publish it."
        />
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-fg">Publishing</h2>
        <Select
          id="privacy-default-wave-visibility"
          label="Default Wave visibility"
          value={defaultWaveVisibility}
          onChange={(event) => {
            const next = event.target.value as WaveVisibility;
            setDefaultWaveVisibility(next);
            save({ privacy, messagePermission, duetPermission, commentPermission, defaultWaveVisibility: next });
          }}
          options={VISIBILITY_OPTIONS}
          disabled={isPending}
          hint="This actually controls who can open it — you can still change it per Wave when publishing."
        />
      </section>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
