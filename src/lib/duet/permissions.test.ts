import { describe, expect, it } from "vitest";

import {
  canRequestDuet,
  type CanRequestDuetInput,
  type DuetPermissionCreatorProfile,
  type DuetPermissionRelationship,
  type DuetPermissionWave,
} from "./permissions";

const VIEWER_ID = "11111111-1111-1111-1111-111111111111";
const CREATOR_ID = "22222222-2222-2222-2222-222222222222";

function wave(overrides: Partial<DuetPermissionWave> = {}): DuetPermissionWave {
  return {
    id: "wave-1",
    creatorId: CREATOR_ID,
    deletedAt: null,
    visibility: "everyone",
    duetPermission: null,
    ...overrides,
  };
}

function creatorProfile(overrides: Partial<DuetPermissionCreatorProfile> = {}): DuetPermissionCreatorProfile {
  return {
    id: CREATOR_ID,
    privacy: "public",
    duetPermission: "everyone",
    ...overrides,
  };
}

function relationship(overrides: Partial<DuetPermissionRelationship> = {}): DuetPermissionRelationship {
  return {
    isBlockedEitherWay: false,
    viewerFollowsCreator: false,
    creatorFollowsViewer: false,
    existingRequestStatus: null,
    ...overrides,
  };
}

function input(overrides: Partial<CanRequestDuetInput> = {}): CanRequestDuetInput {
  return {
    viewerId: VIEWER_ID,
    wave: wave(),
    creatorProfile: creatorProfile(),
    relationship: relationship(),
    ...overrides,
  };
}

describe("canRequestDuet", () => {
  it("allows the default happy path: public creator, 'everyone' audience, no history", () => {
    expect(canRequestDuet(input())).toEqual({ allowed: true });
  });

  it("denies a signed-out viewer", () => {
    expect(canRequestDuet(input({ viewerId: null }))).toEqual({
      allowed: false,
      reason: "not_signed_in",
    });
  });

  it("denies a self-request (spec: record directly instead)", () => {
    expect(canRequestDuet(input({ viewerId: CREATOR_ID }))).toEqual({
      allowed: false,
      reason: "self_request",
    });
  });

  it("denies a soft-deleted Wave", () => {
    expect(canRequestDuet(input({ wave: wave({ deletedAt: "2026-01-01T00:00:00Z" }) }))).toEqual({
      allowed: false,
      reason: "wave_unavailable",
    });
  });

  it("denies an 'only me' Wave regardless of relationship", () => {
    expect(
      canRequestDuet(
        input({
          wave: wave({ visibility: "only_me" }),
          relationship: relationship({ viewerFollowsCreator: true }),
        }),
      ),
    ).toEqual({ allowed: false, reason: "wave_unavailable" });
  });

  it("denies a private-profile creator's Wave when the viewer does not follow them", () => {
    expect(
      canRequestDuet(input({ creatorProfile: creatorProfile({ privacy: "private" }) })),
    ).toEqual({ allowed: false, reason: "wave_unavailable" });
  });

  it("allows a private-profile creator's Wave when the viewer follows them", () => {
    expect(
      canRequestDuet(
        input({
          creatorProfile: creatorProfile({ privacy: "private" }),
          relationship: relationship({ viewerFollowsCreator: true }),
        }),
      ),
    ).toEqual({ allowed: true });
  });

  it("denies a 'followers'-only Wave when the viewer does not follow the creator", () => {
    expect(canRequestDuet(input({ wave: wave({ visibility: "followers" }) }))).toEqual({
      allowed: false,
      reason: "wave_unavailable",
    });
  });

  it("denies when either account has blocked the other", () => {
    expect(
      canRequestDuet(input({ relationship: relationship({ isBlockedEitherWay: true }) })),
    ).toEqual({ allowed: false, reason: "blocked" });
  });

  it("denies when the creator has disabled Duets ('nobody', account default)", () => {
    expect(
      canRequestDuet(input({ creatorProfile: creatorProfile({ duetPermission: "nobody" }) })),
    ).toEqual({ allowed: false, reason: "duets_disabled" });
  });

  it("denies when the per-Wave override disables Duets even if the account default allows them", () => {
    expect(
      canRequestDuet(
        input({
          wave: wave({ duetPermission: "nobody" }),
          creatorProfile: creatorProfile({ duetPermission: "everyone" }),
        }),
      ),
    ).toEqual({ allowed: false, reason: "duets_disabled" });
  });

  it("a per-Wave override wins over the account default in the other direction too", () => {
    expect(
      canRequestDuet(
        input({
          wave: wave({ duetPermission: "everyone" }),
          creatorProfile: creatorProfile({ duetPermission: "nobody" }),
        }),
      ),
    ).toEqual({ allowed: true });
  });

  it("'followers' audience denies a non-follower", () => {
    expect(
      canRequestDuet(input({ creatorProfile: creatorProfile({ duetPermission: "followers" }) })),
    ).toEqual({ allowed: false, reason: "audience_not_allowed" });
  });

  it("'followers' audience allows a follower", () => {
    expect(
      canRequestDuet(
        input({
          creatorProfile: creatorProfile({ duetPermission: "followers" }),
          relationship: relationship({ viewerFollowsCreator: true }),
        }),
      ),
    ).toEqual({ allowed: true });
  });

  it("'following' ('people I follow') audience denies unless the creator follows the viewer back", () => {
    expect(
      canRequestDuet(input({ creatorProfile: creatorProfile({ duetPermission: "following" }) })),
    ).toEqual({ allowed: false, reason: "audience_not_allowed" });
  });

  it("'following' audience allows when the creator follows the viewer", () => {
    expect(
      canRequestDuet(
        input({
          creatorProfile: creatorProfile({ duetPermission: "following" }),
          relationship: relationship({ creatorFollowsViewer: true }),
        }),
      ),
    ).toEqual({ allowed: true });
  });

  it("denies a duplicate/concurrent request while one is still pending", () => {
    expect(
      canRequestDuet(input({ relationship: relationship({ existingRequestStatus: "pending" }) })),
    ).toEqual({ allowed: false, reason: "duplicate_pending_request" });
  });

  it("an EXPIRED prior request does not block a new one (only 'pending' does, per the partial unique index)", () => {
    expect(
      canRequestDuet(input({ relationship: relationship({ existingRequestStatus: "expired" }) })),
    ).toEqual({ allowed: true });
  });

  it("a DECLINED prior request does not block a new one", () => {
    expect(
      canRequestDuet(input({ relationship: relationship({ existingRequestStatus: "declined" }) })),
    ).toEqual({ allowed: true });
  });

  it("a CANCELLED prior request does not block a new one", () => {
    expect(
      canRequestDuet(input({ relationship: relationship({ existingRequestStatus: "cancelled" }) })),
    ).toEqual({ allowed: true });
  });
});
