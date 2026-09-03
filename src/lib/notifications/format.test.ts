import { describe, expect, it } from "vitest";

import { routes } from "@/config/routes";
import type { NotificationType, NotificationWithActor, Profile } from "@/types/domain";

import { formatNotification } from "./format";

const ACTOR: Profile = {
  id: "actor-1",
  username: "ada",
  displayName: "Ada",
  bio: null,
  avatarUrl: null,
  privacy: "public",
  theme: { backgroundColor: "ink", backgroundGradient: "none", backgroundPattern: "none", accent: "aqua" },
  permissions: {
    duet: "everyone",
    message: "everyone",
    comment: "everyone",
    defaultWaveVisibility: "everyone",
  },
  interests: [],
  onboardedAt: null,
  counts: { followers: 0, following: 0, waves: 0 },
  createdAt: "2026-01-01T00:00:00.000Z",
};

function baseNotification(overrides: Partial<NotificationWithActor>): NotificationWithActor {
  return {
    id: "notif-1",
    recipientId: "recipient-1",
    type: "follow",
    actorId: ACTOR.id,
    waveId: null,
    commentId: null,
    duetRequestId: null,
    conversationId: null,
    messageId: null,
    groupKey: "follow:recipient-1",
    count: 1,
    readAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    actor: ACTOR,
    ...overrides,
  };
}

describe("formatNotification", () => {
  it("formats a follow notification, linking to the actor's profile", () => {
    const result = formatNotification(baseNotification({ type: "follow" }));
    expect(result.title).toBe("Ada started following you");
    expect(result.href).toBe(routes.profile("ada"));
  });

  it("formats a follow request", () => {
    const result = formatNotification(baseNotification({ type: "follow_request" }));
    expect(result.title).toBe("Ada asked to follow you");
    expect(result.href).toBe(routes.profile("ada"));
  });

  it("formats a comment notification, linking to the Wave", () => {
    const result = formatNotification(
      baseNotification({ type: "comment", waveId: "wave-1", commentId: "comment-1" }),
    );
    expect(result.title).toBe("Ada commented on your Wave");
    expect(result.href).toBe(routes.wave("wave-1"));
  });

  it("formats a comment reply", () => {
    const result = formatNotification(
      baseNotification({ type: "comment_reply", waveId: "wave-1", commentId: "comment-2" }),
    );
    expect(result.title).toBe("Ada replied to your comment");
    expect(result.href).toBe(routes.wave("wave-1"));
  });

  it("formats a save notification", () => {
    const result = formatNotification(baseNotification({ type: "save", waveId: "wave-1" }));
    expect(result.title).toBe("Ada saved your Wave");
    expect(result.href).toBe(routes.wave("wave-1"));
  });

  it("formats a share notification", () => {
    const result = formatNotification(baseNotification({ type: "share", waveId: "wave-1" }));
    expect(result.title).toBe("Ada shared your Wave");
    expect(result.href).toBe(routes.wave("wave-1"));
  });

  it("formats a Duet Request, linking to the Wave in question", () => {
    const result = formatNotification(
      baseNotification({ type: "duet_request", waveId: "wave-1", duetRequestId: "req-1" }),
    );
    expect(result.title).toBe("Ada requested a Duet with your Wave");
    expect(result.href).toBe(routes.wave("wave-1"));
  });

  it("formats an accepted Duet Request", () => {
    const result = formatNotification(
      baseNotification({ type: "duet_accepted", waveId: "wave-1", duetRequestId: "req-1" }),
    );
    expect(result.title).toBe("Ada accepted your Duet Request");
    expect(result.href).toBe(routes.wave("wave-1"));
  });

  it("formats a declined Duet Request", () => {
    const result = formatNotification(
      baseNotification({ type: "duet_declined", waveId: "wave-1", duetRequestId: "req-1" }),
    );
    expect(result.title).toBe("Ada declined your Duet Request");
    expect(result.href).toBe(routes.wave("wave-1"));
  });

  it("formats a published Duet, linking to the new Duet Wave", () => {
    const result = formatNotification(baseNotification({ type: "duet_published", waveId: "duet-wave-1" }));
    expect(result.title).toBe("Ada published a Duet using your Wave");
    expect(result.href).toBe(routes.wave("duet-wave-1"));
  });

  it("formats a collaborator invitation", () => {
    const result = formatNotification(baseNotification({ type: "collaborator_invite", waveId: "wave-1" }));
    expect(result.title).toBe("Ada invited you to collaborate on a Wave");
    expect(result.href).toBe(routes.wave("wave-1"));
  });

  it("formats an accepted collaborator invitation", () => {
    const result = formatNotification(baseNotification({ type: "collaborator_accepted", waveId: "wave-1" }));
    expect(result.title).toBe("Ada accepted your collaborator invite");
    expect(result.href).toBe(routes.wave("wave-1"));
  });

  it("formats a message notification, linking to the conversation", () => {
    const result = formatNotification(
      baseNotification({ type: "message", conversationId: "conv-1", messageId: "msg-1" }),
    );
    expect(result.title).toBe("Ada sent you a message");
    expect(result.href).toBe(routes.conversation("conv-1"));
  });

  it("falls back to the Messages inbox when a message notification has no conversation id", () => {
    const result = formatNotification(baseNotification({ type: "message", conversationId: null }));
    expect(result.href).toBe(routes.messages());
  });

  it("formats a system notification without an actor", () => {
    const result = formatNotification(
      baseNotification({ type: "system", actorId: null, actor: null, groupKey: "system:1" }),
    );
    expect(result.title).toBe("AKINTI");
    expect(result.body).toContain("AKINTI");
    expect(result.href).toBe(routes.notifications());
  });

  it("groups more than one event into '<actor> and N others'", () => {
    const result = formatNotification(baseNotification({ type: "save", waveId: "wave-1", count: 3 }));
    expect(result.title).toBe("Ada and 2 others saved your Wave");
  });

  it("uses 'other' (singular) for exactly two events", () => {
    const result = formatNotification(baseNotification({ type: "save", waveId: "wave-1", count: 2 }));
    expect(result.title).toBe("Ada and 1 other saved your Wave");
  });

  it("falls back to a generic actor name when the actor was not resolved (e.g. hidden by RLS)", () => {
    const result = formatNotification(baseNotification({ type: "follow", actor: null }));
    expect(result.title).toBe("Someone started following you");
    expect(result.href).toBe(routes.notifications());
  });

  it("falls back to the notifications route when a Wave-linked type has no wave id", () => {
    const result = formatNotification(baseNotification({ type: "save", waveId: null }));
    expect(result.href).toBe(routes.notifications());
  });

  it("returns a distinct icon per notification type", () => {
    const types: NotificationType[] = [
      "follow",
      "follow_request",
      "comment",
      "comment_reply",
      "save",
      "share",
      "duet_request",
      "duet_accepted",
      "duet_declined",
      "duet_published",
      "collaborator_invite",
      "collaborator_accepted",
      "message",
      "system",
    ];
    const icons = types.map((type) => formatNotification(baseNotification({ type })).icon);
    expect(new Set(icons).size).toBeGreaterThan(1);
    for (const icon of icons) {
      expect(icon).toBeDefined();
    }
  });
});
