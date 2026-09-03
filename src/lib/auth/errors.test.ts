import { describe, expect, it } from "vitest";

import { mapAuthError } from "./errors";

describe("mapAuthError", () => {
  it("maps a known code to its English message", () => {
    expect(mapAuthError({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe(
      "That email and password combination is not correct.",
    );
  });

  it("maps user_already_exists and email_exists to the same message", () => {
    const a = mapAuthError({ code: "user_already_exists" });
    const b = mapAuthError({ code: "email_exists" });
    expect(a).toBe(b);
    expect(a).toMatch(/already exists/i);
  });

  it("never echoes the raw Supabase message back to the caller", () => {
    const raw = "duplicate key value violates unique constraint \"profiles_username_key\"";
    const result = mapAuthError({ code: "weak_password", message: raw });
    expect(result).not.toContain("duplicate key");
    expect(result).not.toContain("constraint");
  });

  it("falls back to a message-substring match when there is no code", () => {
    expect(mapAuthError({ message: "Invalid login credentials" })).toBe(
      "That email and password combination is not correct.",
    );
    expect(mapAuthError({ message: "Email not confirmed" })).toMatch(/confirm your email/i);
  });

  it("falls back to a generic message for an unrecognized error", () => {
    expect(mapAuthError({ code: "something_new_and_unmapped" })).toBe(
      "Something went wrong. Try again in a moment.",
    );
    expect(mapAuthError({ message: "totally unexpected failure" })).toBe(
      "Something went wrong. Try again in a moment.",
    );
  });

  it("handles null/undefined without throwing", () => {
    expect(mapAuthError(null)).toBe("Something went wrong. Try again in a moment.");
    expect(mapAuthError(undefined)).toBe("Something went wrong. Try again in a moment.");
  });

  it("maps a rate limit error", () => {
    expect(mapAuthError({ code: "over_request_rate_limit" })).toMatch(/too many attempts/i);
  });
});
