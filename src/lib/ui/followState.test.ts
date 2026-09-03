import { describe, expect, it } from "vitest";

import { resolveFollowButtonState } from "./followState";

describe("resolveFollowButtonState", () => {
  it("renders nothing on your own profile", () => {
    const state = resolveFollowButtonState({
      isSelf: true,
      isSignedIn: true,
      followStatus: null,
    });
    expect(state.label).toBeNull();
    expect(state.action).toBeNull();
    expect(state.disabled).toBe(true);
  });

  it("offers Follow to a signed-out visitor", () => {
    const state = resolveFollowButtonState({
      isSelf: false,
      isSignedIn: false,
      followStatus: null,
    });
    expect(state.label).toBe("Follow");
    expect(state.action).toBe("follow");
    expect(state.disabled).toBe(false);
  });

  it("offers Follow when not yet following", () => {
    const state = resolveFollowButtonState({
      isSelf: false,
      isSignedIn: true,
      followStatus: null,
    });
    expect(state.label).toBe("Follow");
    expect(state.action).toBe("follow");
    expect(state.isMuted).toBe(false);
  });

  it("offers Follow back when the target already follows the viewer", () => {
    const state = resolveFollowButtonState({
      isSelf: false,
      isSignedIn: true,
      followStatus: null,
      followsViewer: true,
    });
    expect(state.label).toBe("Follow back");
    expect(state.action).toBe("follow");
  });

  it("shows Requested with a cancel action while pending", () => {
    const state = resolveFollowButtonState({
      isSelf: false,
      isSignedIn: true,
      followStatus: "pending",
    });
    expect(state.label).toBe("Requested");
    expect(state.action).toBe("cancel");
    expect(state.isMuted).toBe(true);
  });

  it("shows Following with an unfollow action once accepted", () => {
    const state = resolveFollowButtonState({
      isSelf: false,
      isSignedIn: true,
      followStatus: "accepted",
    });
    expect(state.label).toBe("Following");
    expect(state.action).toBe("unfollow");
    expect(state.isMuted).toBe(true);
  });

  it("never disables the button for a signed-in non-self viewer", () => {
    for (const followStatus of [null, "pending", "accepted"] as const) {
      const state = resolveFollowButtonState({ isSelf: false, isSignedIn: true, followStatus });
      expect(state.disabled).toBe(false);
    }
  });
});
