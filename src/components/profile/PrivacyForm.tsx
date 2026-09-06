"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { ChevronRight } from "@/components/ui/icons";

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
  const t = useTranslations("PrivacyForm");
  const tTerms = useTranslations("Terms");

  const audienceLabels: Record<PermissionAudience, string> = {
    everyone: t("audienceEveryone"),
    followers: tTerms("followers"),
    following: t("audienceFollowing"),
    nobody: t("audienceNobody"),
  };
  const commentAudienceLabels: Record<(typeof COMMENT_AUDIENCES)[number], string> = {
    everyone: t("audienceEveryone"),
    followers: tTerms("followers"),
    nobody: t("audienceNobody"),
  };
  const visibilityLabels: Record<WaveVisibility, string> = {
    everyone: t("audienceEveryone"),
    followers: tTerms("followers"),
    only_me: t("visibilityOnlyMe"),
  };
  const audienceOptions: SelectOption[] = PERMISSION_AUDIENCES.map((value) => ({
    value,
    label: audienceLabels[value],
  }));
  const commentAudienceOptions: SelectOption[] = COMMENT_AUDIENCES.map((value) => ({
    value,
    label: commentAudienceLabels[value],
  }));
  const visibilityOptions: SelectOption[] = WAVE_VISIBILITIES.map((value) => ({
    value,
    label: visibilityLabels[value],
  }));

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
        setError(result.formError ?? t("saveErrorDefault"));
        return;
      }
      await refreshProfile();
      toast({ title: result.message ?? t("saved"), tone: "success" });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-surface p-5">
        <Switch
          label={t("privateAccountLabel")}
          description={t("privateAccountDescription")}
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
              {t("pendingFollowRequests")}
              {pendingFollowRequestCount > 0 ? (
                <Badge>{pendingFollowRequestCount}</Badge>
              ) : null}
            </span>
            <ChevronRight className="size-4 text-fg-subtle" aria-hidden="true" />
          </Link>
        ) : null}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-fg">{t("whoCanReachYou")}</h2>
        <Select
          id="privacy-message-permission"
          label={t("whoCanMessageLabel")}
          value={messagePermission}
          onChange={(event) => {
            const next = event.target.value as PermissionAudience;
            setMessagePermission(next);
            save({ privacy, messagePermission: next, duetPermission, commentPermission, defaultWaveVisibility });
          }}
          options={audienceOptions}
          disabled={isPending}
        />
        <Select
          id="privacy-duet-permission"
          label={t("whoCanDuetLabel")}
          value={duetPermission}
          onChange={(event) => {
            const next = event.target.value as PermissionAudience;
            setDuetPermission(next);
            save({ privacy, messagePermission, duetPermission: next, commentPermission, defaultWaveVisibility });
          }}
          options={audienceOptions}
          disabled={isPending}
        />
        <Select
          id="privacy-comment-permission"
          label={t("whoCanCommentLabel")}
          value={commentPermission}
          onChange={(event) => {
            const next = event.target.value as PermissionAudience;
            setCommentPermission(next);
            save({ privacy, messagePermission, duetPermission, commentPermission: next, defaultWaveVisibility });
          }}
          options={commentAudienceOptions}
          disabled={isPending}
          hint={t("commentHint")}
        />
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-fg">{t("publishingHeading")}</h2>
        <Select
          id="privacy-default-wave-visibility"
          label={t("defaultVisibilityLabel")}
          value={defaultWaveVisibility}
          onChange={(event) => {
            const next = event.target.value as WaveVisibility;
            setDefaultWaveVisibility(next);
            save({ privacy, messagePermission, duetPermission, commentPermission, defaultWaveVisibility: next });
          }}
          options={visibilityOptions}
          disabled={isPending}
          hint={t("defaultVisibilityHint")}
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
