"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Ban, Flag, MoreHorizontal } from "@/components/ui/icons";

import { block, unblock } from "@/app/(app)/u/[username]/actions";
import { IconButton, Menu, useToast, type MenuItem } from "@/components/ui";

import { ReportSheet } from "./ReportSheet";

export interface ProfileOverflowMenuProps {
  profileId: string;
  username: string;
  /** Whether the *viewer* has already blocked this profile. */
  isBlocked: boolean;
  className?: string;
}

/** Block/Unblock + Report, behind an overflow menu (spec §21, §26). */
export function ProfileOverflowMenu({
  profileId,
  username,
  isBlocked,
  className,
}: ProfileOverflowMenuProps) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("ProfileOverflowMenu");
  const tTerms = useTranslations("Terms");
  const [reportOpen, setReportOpen] = useState(false);
  const [, startTransition] = useTransition();

  function handleBlockToggle() {
    startTransition(async () => {
      const result = isBlocked ? await unblock(profileId) : await block(profileId);
      if (!result.ok) {
        toast({ title: result.formError ?? t("somethingWrong"), tone: "error" });
        return;
      }
      toast({ title: result.message ?? t("done"), tone: "success" });
      router.refresh();
    });
  }

  const items: MenuItem[] = [
    {
      id: "block",
      label: isBlocked ? tTerms("unblock") : tTerms("block"),
      icon: <Ban className="size-4" />,
      destructive: !isBlocked,
      onSelect: handleBlockToggle,
    },
    {
      id: "report",
      label: tTerms("report"),
      icon: <Flag className="size-4" />,
      destructive: true,
      onSelect: () => setReportOpen(true),
    },
  ];

  return (
    <>
      <Menu
        label={t("moreActions")}
        align="end"
        className={className}
        items={items}
        trigger={(triggerProps) => (
          <IconButton
            {...triggerProps}
            label={t("moreActions")}
            icon={<MoreHorizontal className="size-4" />}
            variant="secondary"
          />
        )}
      />
      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetProfileId={profileId}
        targetLabel={username}
      />
    </>
  );
}
