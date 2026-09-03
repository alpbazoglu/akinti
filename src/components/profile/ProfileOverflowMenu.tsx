"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban, Flag, MoreHorizontal } from "lucide-react";

import { block, unblock } from "@/app/(app)/u/[username]/actions";
import { TERMS } from "@/config/terminology";
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
  const [reportOpen, setReportOpen] = useState(false);
  const [, startTransition] = useTransition();

  function handleBlockToggle() {
    startTransition(async () => {
      const result = isBlocked ? await unblock(profileId) : await block(profileId);
      if (!result.ok) {
        toast({ title: result.formError ?? "Something went wrong.", tone: "error" });
        return;
      }
      toast({ title: result.message ?? "Done.", tone: "success" });
      router.refresh();
    });
  }

  const items: MenuItem[] = [
    {
      id: "block",
      label: isBlocked ? TERMS.unblock : TERMS.block,
      icon: <Ban className="size-4" />,
      destructive: !isBlocked,
      onSelect: handleBlockToggle,
    },
    {
      id: "report",
      label: TERMS.report,
      icon: <Flag className="size-4" />,
      destructive: true,
      onSelect: () => setReportOpen(true),
    },
  ];

  return (
    <>
      <Menu
        label="More actions"
        align="end"
        className={className}
        items={items}
        trigger={(triggerProps) => (
          <IconButton
            {...triggerProps}
            label="More actions"
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
