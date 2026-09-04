import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { DatabaseError } from "@/lib/db/types";

import { isRateLimitError, mapModerationError, RATE_LIMIT_MESSAGE, RATE_LIMIT_SQLSTATE } from "./errors";

/** A minimal fixture — `DatabaseError` only ever reads `.message`/`.code`/`.details`/`.hint`. */
function fakePostgrestError(code: string, message: string): PostgrestError {
  return { message, code, details: "", hint: "", name: "PostgrestError" } as PostgrestError;
}

function rateLimitError(): DatabaseError {
  return new DatabaseError(
    "insertComment",
    fakePostgrestError(RATE_LIMIT_SQLSTATE, "rate limit exceeded for comment (max 10 per 00:01:00)"),
  );
}

function otherDatabaseError(code: string): DatabaseError {
  return new DatabaseError("insertComment", fakePostgrestError(code, "some other failure"));
}

describe("isRateLimitError", () => {
  it("is true for the AKRTL SQLSTATE", () => {
    expect(isRateLimitError(rateLimitError())).toBe(true);
  });

  it("is false for a different DatabaseError code", () => {
    expect(isRateLimitError(otherDatabaseError("23505"))).toBe(false);
  });

  it("is false for a non-DatabaseError value", () => {
    expect(isRateLimitError(new Error("boom"))).toBe(false);
    expect(isRateLimitError("boom")).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
  });
});

describe("mapModerationError", () => {
  it("maps a rate-limit error to the shared English copy", () => {
    expect(mapModerationError(rateLimitError(), "fallback")).toBe(RATE_LIMIT_MESSAGE);
  });

  it("falls back for every other error", () => {
    expect(mapModerationError(otherDatabaseError("23505"), "fallback")).toBe("fallback");
    expect(mapModerationError(new Error("boom"), "fallback")).toBe("fallback");
    expect(mapModerationError(null, "fallback")).toBe("fallback");
  });
});
