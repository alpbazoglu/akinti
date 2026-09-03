/**
 * Pure, client-safe mirror of `public.can_request_duet` (spec §15, §46 —
 * `supabase/migrations/20260903121000_authorization_functions.sql`).
 *
 * THE SQL FUNCTION IS AUTHORITATIVE. This module exists so the request page
 * can render a specific, honest denial reason without an extra round trip,
 * and so the security scenarios in spec §46 have a fast, deterministic test
 * surface — it must never be trusted as the actual authorization boundary.
 * Every real request/accept/publish path re-checks server-side: `requestDuet`
 * (`src/app/(app)/w/[id]/duet/actions.ts`) calls `canRequestDuet()` from
 * `src/lib/db/duetRequests.ts` (the `can_request_duet` RPC) before ever
 * inserting a row, and the `duet_requests_insert` RLS policy plus
 * `waves_guard_insert` re-verify independently of both. If this file and the
 * SQL function ever disagree, the SQL wins and this file has a bug.
 *
 * Mirrors, in order:
 *   1. `can_view_wave`      — soft-delete, `only_me` visibility, private
 *                             profile without a follow, `followers`-only
 *                             Wave without a follow. (Collaborator-credit
 *                             and block-based visibility are intentionally
 *                             NOT modeled here — a blocked viewer is denied
 *                             at step 2 below regardless, and a Duet is never
 *                             requested by a Wave's own accepted collaborator
 *                             in practice; keeping this mirror narrow avoids
 *                             it drifting from a SQL function it cannot
 *                             query.)
 *   2. self-request guard   — `v_creator = v_viewer` in `can_request_duet`.
 *   3. block guard          — `is_blocked_between`.
 *   4. `audience_allows`    — resolves `waves.duet_permission ??
 *                             profiles.duet_permission` against the
 *                             relationship.
 *   5. duplicate-pending    — `duet_requests_one_pending_per_requester`
 *                             (a partial unique index on `status = 'pending'`
 *                             only — an EXPIRED/DECLINED/CANCELLED prior
 *                             request never blocks a new one, which is why
 *                             `existingRequestStatus` is a status, not a
 *                             boolean).
 */

import type { DuetRequestStatus, PermissionAudience, WaveVisibility } from "@/types/domain";

export interface DuetPermissionWave {
  readonly id: string;
  readonly creatorId: string;
  /** Non-null when the Wave has been soft-deleted (`waves.deleted_at`). */
  readonly deletedAt: string | null;
  readonly visibility: WaveVisibility;
  /** Per-Wave override. `null` inherits `creatorProfile.duetPermission`. */
  readonly duetPermission: PermissionAudience | null;
}

export interface DuetPermissionCreatorProfile {
  readonly id: string;
  readonly privacy: "public" | "private";
  /** Account-level default (`profiles.duet_permission`), never null at the row level. */
  readonly duetPermission: PermissionAudience;
}

export interface DuetPermissionRelationship {
  /** `is_blocked_between(viewer, creator)` — symmetric, either direction. */
  readonly isBlockedEitherWay: boolean;
  /** `is_following(viewer, creator)` — resolves `'followers'` audience and private-profile visibility. */
  readonly viewerFollowsCreator: boolean;
  /** `is_following(creator, viewer)` — resolves `'following'` ("people I follow") audience. */
  readonly creatorFollowsViewer: boolean;
  /**
   * Status of the viewer's most recent (if any) `duet_requests` row for this
   * Wave. `null` when none exists. Only `'pending'` blocks a new request —
   * see `duet_requests_one_pending_per_requester`'s partial index above.
   */
  readonly existingRequestStatus: DuetRequestStatus | null;
}

export interface CanRequestDuetInput {
  /** `auth.uid()`. `null` means signed out. */
  readonly viewerId: string | null;
  readonly wave: DuetPermissionWave;
  readonly creatorProfile: DuetPermissionCreatorProfile;
  readonly relationship: DuetPermissionRelationship;
}

export type DuetPermissionDenialReason =
  | "not_signed_in"
  | "wave_unavailable"
  | "self_request"
  | "blocked"
  | "duets_disabled"
  | "audience_not_allowed"
  | "duplicate_pending_request";

export type CanRequestDuetResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: DuetPermissionDenialReason };

function denied(reason: DuetPermissionDenialReason): CanRequestDuetResult {
  return { allowed: false, reason };
}

/**
 * A narrow mirror of `can_view_wave` — only the branches relevant to "can
 * this viewer even see the Wave they're trying to Duet." Blocks are checked
 * separately (and identically) by the caller, mirroring `can_request_duet`'s
 * own two-step SQL shape rather than folding everything into one function.
 */
function canViewWave(
  wave: DuetPermissionWave,
  creatorProfile: DuetPermissionCreatorProfile,
  relationship: DuetPermissionRelationship,
): boolean {
  if (wave.deletedAt) return false;
  if (wave.visibility === "only_me") return false;
  if (creatorProfile.privacy === "private" && !relationship.viewerFollowsCreator) return false;
  if (wave.visibility === "followers" && !relationship.viewerFollowsCreator) return false;
  return true;
}

export function canRequestDuet(input: CanRequestDuetInput): CanRequestDuetResult {
  const { viewerId, wave, creatorProfile, relationship } = input;

  if (!viewerId) {
    return denied("not_signed_in");
  }
  if (!canViewWave(wave, creatorProfile, relationship)) {
    return denied("wave_unavailable");
  }
  if (viewerId === wave.creatorId) {
    // "You do not request a Duet on your own Wave — you just record one directly."
    return denied("self_request");
  }
  if (relationship.isBlockedEitherWay) {
    return denied("blocked");
  }

  const audience = wave.duetPermission ?? creatorProfile.duetPermission;
  if (audience === "nobody") {
    return denied("duets_disabled");
  }
  if (audience === "followers" && !relationship.viewerFollowsCreator) {
    return denied("audience_not_allowed");
  }
  if (audience === "following" && !relationship.creatorFollowsViewer) {
    return denied("audience_not_allowed");
  }
  // 'everyone' (or an already-satisfied 'followers'/'following') passes here.

  if (relationship.existingRequestStatus === "pending") {
    return denied("duplicate_pending_request");
  }

  return { allowed: true };
}

/** Human-readable copy for each denial reason, for the request page (spec §38: no silent failures). */
export const DUET_PERMISSION_DENIAL_MESSAGES: Readonly<Record<DuetPermissionDenialReason, string>> = {
  not_signed_in: "Sign in to request a Duet.",
  wave_unavailable: "This Wave isn't available.",
  self_request: "You can't request a Duet on your own Wave — record one directly instead.",
  blocked: "You can't request a Duet on this Wave.",
  duets_disabled: "This creator has turned off Duet Requests.",
  audience_not_allowed: "This creator only accepts Duet Requests from a specific audience you're not in.",
  duplicate_pending_request: "You already have a pending Duet Request for this Wave.",
};
