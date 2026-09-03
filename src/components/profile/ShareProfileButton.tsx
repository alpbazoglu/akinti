"use client";

import { Link as LinkIcon } from "lucide-react";

import { TERMS } from "@/config/terminology";
import { IconButton, useToast } from "@/components/ui";

export interface ShareProfileButtonProps {
  username: string;
  className?: string;
}

/** Copy-link "Share profile" action (spec §21). No native share sheet dependency — clipboard is universal. */
export function ShareProfileButton({ username, className }: ShareProfileButtonProps) {
  const { toast } = useToast();

  async function handleClick() {
    const url = `${window.location.origin}/u/${username}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: url, tone: "success" });
    } catch {
      toast({
        title: "Could not copy the link",
        description: url,
        tone: "error",
      });
    }
  }

  return (
    <IconButton
      label={TERMS.shareProfile}
      icon={<LinkIcon className="size-4" />}
      variant="secondary"
      onClick={handleClick}
      className={className}
    />
  );
}
