"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { UserCheck, UserPlus } from "@/components/ui/icons";

import { cancelFollowRequest, follow, unfollow } from "@/app/(app)/u/[username]/actions";
import { routes } from "@/config/routes";
import type { FollowStatus } from "@/types/domain";
import { Button, type ButtonSize, useActionToast } from "@/components/ui";
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
  const { notify } = useActionToast();
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

  // Optimistic (DESIGN_V3_DESKTOP.md "Feedback": "optimistic for follow/
  // save/replay"): the button reflects the new status the instant it's
  // pressed. `useOptimistic` reverts to `status` on its own once the
  // transition below settles — a failed request just never calls
  // `setStatus`, so the revert happens for free, no manual rollback needed.
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(
    status,
    (_current: FollowStatus | null, next: FollowStatus | null) => next,
  );

  const state = resolveFollowButtonState({
    isSelf: false,
    isSignedIn,
    followStatus: optimisticStatus,
    followsViewer,
  });

  function handleClick() {
    if (!isSignedIn) {
      router.push(routes.login(window.location.pathname));
      return;
    }

    setError(null);
    const action = state.action;
    // Guesses "accepted" for a fresh follow — right for the common public
    // profile, and for a private one it settles to "pending" the instant
    // `result.status` comes back (this button doesn't know the target's
    // privacy up front). A one-frame correction beats waiting on every
    // follow just to protect the rarer private case.
    const optimisticNext: FollowStatus | null =
      action === "follow" ? "accepted" : action === "cancel" ? null : null;

    startTransition(async () => {
      setOptimisticStatus(optimisticNext);
      const result =
        action === "follow"
          ? await follow(profileId)
          : action === "cancel"
            ? await cancelFollowRequest(profileId)
            : await unfollow(profileId);

      if (!result.ok) {
        setError(result.formError ?? "Something went wrong.");
        if (action !== "cancel") notify(action === "follow" ? "follow" : "unfollow", "error");
        return;
      }
      setStatus(result.status ?? null);
      if (action !== "cancel") notify(action === "follow" ? "follow" : "unfollow", "success");
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
        // Disabled, not `loading`: `loading` hides the label behind a
        // spinner, which would erase the whole point of the optimistic
        // label above. Still blocks a double-submit while the request is
        // in flight.
        disabled={isPending}
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
