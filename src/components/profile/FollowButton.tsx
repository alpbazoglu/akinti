"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UserCheck, UserPlus } from "@/components/ui/icons";

import { cancelFollowRequest, follow, unfollow } from "@/app/(app)/u/[username]/actions";
import { routes } from "@/config/routes";
import type { FollowStatus } from "@/types/domain";
import { Button, type ButtonSize } from "@/components/ui";
import { resolveFollowButtonState } from "@/lib/ui";

export interface FollowButtonProps {
  profileId: string;
  initialFollowStatus: FollowStatus | null;
  isSignedIn: boolean;
  followsViewer?: boolean;
  /** `sm` on a profile header, `xs` inside the Explore creator tile. */
  size?: ButtonSize;
  /** Drops the leading glyph where the key has to fit a 128px tile. */
  hideIcon?: boolean;
  className?: string;
}

/**
 * Follow / Unfollow / Requested (spec §21). A private target starts a
 * follow request instead of following outright — `followProfile` (the
 * `follows_before_insert` trigger, migration 12) decides that server-side,
 * this button only reflects whatever status comes back.
 */
export function FollowButton({
  profileId,
  initialFollowStatus,
  isSignedIn,
  followsViewer = false,
  size = "sm",
  hideIcon = false,
  className,
}: FollowButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<FollowStatus | null>(initialFollowStatus);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // The server is the source of truth; resync when a refresh brings a new
  // prop (this component instance persists across `router.refresh()`, so its
  // own state would otherwise go stale rather than pick up the fresh value).
  // Adjusting state during render — not in an effect — per React's own
  // guidance for "storing information from previous renders"; it avoids the
  // extra render an effect-based sync would cause.
  const [prevInitialFollowStatus, setPrevInitialFollowStatus] = useState(initialFollowStatus);
  if (initialFollowStatus !== prevInitialFollowStatus) {
    setPrevInitialFollowStatus(initialFollowStatus);
    setStatus(initialFollowStatus);
  }

  const state = resolveFollowButtonState({
    isSelf: false,
    isSignedIn,
    followStatus: status,
    followsViewer,
  });

  function handleClick() {
    if (!isSignedIn) {
      router.push(routes.login(window.location.pathname));
      return;
    }

    setError(null);

    startTransition(async () => {
      const result =
        state.action === "follow"
          ? await follow(profileId)
          : state.action === "cancel"
            ? await cancelFollowRequest(profileId)
            : await unfollow(profileId);

      if (!result.ok) {
        setError(result.formError ?? "Something went wrong.");
        return;
      }
      setStatus(result.status ?? null);
      router.refresh();
    });
  }

  if (state.label === null) {
    return null;
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant={state.isMuted ? "secondary" : "primary"}
        size={size}
        fullWidth={hideIcon}
        onClick={handleClick}
        loading={isPending}
        leadingIcon={
          hideIcon ? undefined : state.isMuted ? (
            <UserCheck className="size-4" />
          ) : (
            <UserPlus className="size-4" />
          )
        }
      >
        {state.label}
      </Button>
      {error ? (
        <p role="alert" className="type-caption mt-1 text-signal-deep">
          {error}
        </p>
      ) : null}
    </div>
  );
}
