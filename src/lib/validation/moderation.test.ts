import { describe, expect, it } from "vitest";

import {
  claimReportSchema,
  dismissReportSchema,
  moderationQueueFiltersSchema,
  notificationPreferencesSchema,
  resolveReportSchema,
} from "./moderation";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("notificationPreferencesSchema", () => {
  it("accepts an empty object", () => {
    expect(notificationPreferencesSchema.safeParse({}).success).toBe(true);
  });

  it("accepts every known key set to true or false", () => {
    const result = notificationPreferencesSchema.safeParse({
      message: false,
      duet: true,
      comment: false,
      follower: true,
      system: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a partial set of keys", () => {
    expect(notificationPreferencesSchema.safeParse({ message: false }).success).toBe(true);
  });

  it("rejects an unknown key (strict, mirrors the DB CHECK constraint)", () => {
    const result = notificationPreferencesSchema.safeParse({ like: false });
    expect(result.success).toBe(false);
  });

  it("rejects a non-boolean value", () => {
    const result = notificationPreferencesSchema.safeParse({ message: "off" });
    expect(result.success).toBe(false);
  });
});

describe("resolveReportSchema", () => {
  it("accepts a valid action with no note", () => {
    const result = resolveReportSchema.safeParse({ reportId: UUID, action: "hide_wave" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBeNull();
    }
  });

  it("trims and accepts a note", () => {
    const result = resolveReportSchema.safeParse({ reportId: UUID, action: "warn_user", note: "  spam  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBe("spam");
    }
  });

  it("rejects an unknown action", () => {
    expect(resolveReportSchema.safeParse({ reportId: UUID, action: "ban_forever" }).success).toBe(false);
  });

  it("rejects a non-uuid reportId", () => {
    expect(resolveReportSchema.safeParse({ reportId: "not-a-uuid", action: "none" }).success).toBe(false);
  });

  it("rejects a note over 1000 characters", () => {
    const result = resolveReportSchema.safeParse({
      reportId: UUID,
      action: "none",
      note: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});

describe("dismissReportSchema", () => {
  it("accepts a bare reportId", () => {
    const result = dismissReportSchema.safeParse({ reportId: UUID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBeNull();
    }
  });
});

describe("claimReportSchema", () => {
  it("accepts a reportId", () => {
    expect(claimReportSchema.safeParse({ reportId: UUID }).success).toBe(true);
  });

  it("rejects a missing reportId", () => {
    expect(claimReportSchema.safeParse({}).success).toBe(false);
  });
});

describe("moderationQueueFiltersSchema", () => {
  it("defaults every filter to null and a sensible page size", () => {
    const result = moderationQueueFiltersSchema.parse({});
    expect(result).toEqual({ status: null, targetType: null, reason: null, limit: 20, cursor: null });
  });

  it("accepts a full filter set", () => {
    const result = moderationQueueFiltersSchema.safeParse({
      status: "open",
      targetType: "wave",
      reason: "spam",
      limit: 10,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(moderationQueueFiltersSchema.safeParse({ status: "banned" }).success).toBe(false);
  });
});
