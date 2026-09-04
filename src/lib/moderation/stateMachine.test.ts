import { describe, expect, it } from "vitest";

import type { ReportStatus, ReportTargetType } from "@/types/domain";

import {
  applicableActionsFor,
  canTransition,
  isActionApplicableToTarget,
  MODERATION_QUEUE_ACTIONS,
  nextReportStatus,
} from "./stateMachine";

const STATUSES: ReportStatus[] = ["open", "reviewing", "actioned", "dismissed"];
const TARGET_TYPES: ReportTargetType[] = ["wave", "comment", "profile", "message"];

describe("nextReportStatus", () => {
  it("claim moves open -> reviewing", () => {
    expect(nextReportStatus("open", "claim")).toBe("reviewing");
  });

  it("claim leaves every other status untouched", () => {
    expect(nextReportStatus("reviewing", "claim")).toBe("reviewing");
    expect(nextReportStatus("actioned", "claim")).toBe("actioned");
    expect(nextReportStatus("dismissed", "claim")).toBe("dismissed");
  });

  it("resolve always lands on actioned, from any status", () => {
    for (const status of STATUSES) {
      expect(nextReportStatus(status, "resolve")).toBe("actioned");
    }
  });

  it("dismiss always lands on dismissed, from any status", () => {
    for (const status of STATUSES) {
      expect(nextReportStatus(status, "dismiss")).toBe("dismissed");
    }
  });
});

describe("canTransition", () => {
  it("claim is only offered from open", () => {
    expect(canTransition("open", "claim")).toBe(true);
    expect(canTransition("reviewing", "claim")).toBe(false);
    expect(canTransition("actioned", "claim")).toBe(false);
    expect(canTransition("dismissed", "claim")).toBe(false);
  });

  it("resolve/dismiss are offered from open and reviewing, not from a closed report", () => {
    for (const transition of ["resolve", "dismiss"] as const) {
      expect(canTransition("open", transition)).toBe(true);
      expect(canTransition("reviewing", transition)).toBe(true);
      expect(canTransition("actioned", transition)).toBe(false);
      expect(canTransition("dismissed", transition)).toBe(false);
    }
  });
});

describe("isActionApplicableToTarget / applicableActionsFor", () => {
  it("hide_wave is only applicable to a wave report", () => {
    expect(isActionApplicableToTarget("hide_wave", "wave")).toBe(true);
    for (const targetType of TARGET_TYPES.filter((t) => t !== "wave")) {
      expect(isActionApplicableToTarget("hide_wave", targetType)).toBe(false);
    }
  });

  it("hide_comment is only applicable to a comment report", () => {
    expect(isActionApplicableToTarget("hide_comment", "comment")).toBe(true);
    for (const targetType of TARGET_TYPES.filter((t) => t !== "comment")) {
      expect(isActionApplicableToTarget("hide_comment", targetType)).toBe(false);
    }
  });

  it("none/warn_user/suspend_user are applicable to every target type", () => {
    for (const targetType of TARGET_TYPES) {
      expect(isActionApplicableToTarget("none", targetType)).toBe(true);
      expect(isActionApplicableToTarget("warn_user", targetType)).toBe(true);
      expect(isActionApplicableToTarget("suspend_user", targetType)).toBe(true);
    }
  });

  it("applicableActionsFor never returns an action isActionApplicableToTarget rejects", () => {
    for (const targetType of TARGET_TYPES) {
      const applicable = applicableActionsFor(targetType);
      for (const action of MODERATION_QUEUE_ACTIONS) {
        expect(applicable.includes(action)).toBe(isActionApplicableToTarget(action, targetType));
      }
    }
  });

  it("a profile report offers every action except the two content-specific ones", () => {
    expect(applicableActionsFor("profile")).toEqual(["none", "warn_user", "suspend_user"]);
  });
});
