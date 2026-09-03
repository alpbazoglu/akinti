/**
 * Pure mapping from raw follow/viewer state to what the Follow button should
 * show and do (spec §21). Kept separate from any component so the state
 * machine itself is unit-testable without rendering React.
 */

import type { FollowStatus } from "@/types/domain";

export type FollowAction = "follow" | "unfollow" | "cancel";

export interface FollowButtonState {
  /** `null` when no button should render at all (viewing your own profile). */
  label: string | null;
  /** The Server Action to invoke when the button is pressed. */
  action: FollowAction | null;
  /** Secondary visual treatment — outlined/quiet rather than solid accent. */
  isMuted: boolean;
  disabled: boolean;
}

export interface FollowButtonInput {
  /** True when the viewer is looking at their own profile. */
  isSelf: boolean;
  /** True when the viewer is signed in at all. */
  isSignedIn: boolean;
  /** The viewer's current follow edge toward this profile, or `null`. */
  followStatus: FollowStatus | null;
  /** True when this profile follows the viewer back (for "Follow back" copy). */
  followsViewer?: boolean;
}

/**
 * Resolve the Follow button's label/action for every reachable state:
 * self, signed out, not following, pending request, accepted follow.
 */
export function resolveFollowButtonState(input: FollowButtonInput): FollowButtonState {
  const { isSelf, isSignedIn, followStatus, followsViewer = false } = input;

  if (isSelf) {
    return { label: null, action: null, isMuted: false, disabled: true };
  }

  if (!isSignedIn) {
    return { label: "Follow", action: "follow", isMuted: false, disabled: false };
  }

  if (followStatus === "accepted") {
    return { label: "Following", action: "unfollow", isMuted: true, disabled: false };
  }

  if (followStatus === "pending") {
    return { label: "Requested", action: "cancel", isMuted: true, disabled: false };
  }

  // followStatus === null: not following yet.
  return {
    label: followsViewer ? "Follow back" : "Follow",
    action: "follow",
    isMuted: false,
    disabled: false,
  };
}
