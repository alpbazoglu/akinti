import { describe, expect, it } from "vitest";

import {
  emailSchema,
  passwordSchema,
  requestPasswordResetSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "./auth";

describe("emailSchema", () => {
  it("accepts a normal address", () => {
    expect(emailSchema.parse("Person@Example.com")).toBe("person@example.com");
  });

  it("trims and lowercases", () => {
    expect(emailSchema.parse("  Test@Example.COM  ")).toBe("test@example.com");
  });

  it("rejects an invalid address", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
    expect(emailSchema.safeParse("").success).toBe(false);
  });

  it("rejects an address over the max length", () => {
    const local = "a".repeat(250);
    expect(emailSchema.safeParse(`${local}@example.com`).success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("accepts an 8-character password", () => {
    expect(passwordSchema.safeParse("12345678").success).toBe(true);
  });

  it("rejects fewer than 8 characters", () => {
    const result = passwordSchema.safeParse("short1");
    expect(result.success).toBe(false);
  });

  it("rejects more than 72 characters", () => {
    expect(passwordSchema.safeParse("a".repeat(73)).success).toBe(false);
  });

  it("accepts exactly 72 characters", () => {
    expect(passwordSchema.safeParse("a".repeat(72)).success).toBe(true);
  });
});

describe("signUpSchema", () => {
  const valid = { email: "person@example.com", password: "password123", username: "person_one" };

  it("accepts a valid payload", () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid username", () => {
    const result = signUpSchema.safeParse({ ...valid, username: "AB" });
    expect(result.success).toBe(false);
  });

  it("rejects an uppercase or symbol-containing username", () => {
    expect(signUpSchema.safeParse({ ...valid, username: "Person!" }).success).toBe(false);
  });

  it("rejects a missing password", () => {
    expect(signUpSchema.safeParse({ email: valid.email, username: valid.username }).success).toBe(
      false,
    );
  });

  it("reports one error per invalid field", () => {
    const result = signUpSchema.safeParse({ email: "bad", password: "x", username: "a" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(Object.keys(fieldErrors).sort()).toEqual(["email", "password", "username"]);
    }
  });
});

describe("signInSchema", () => {
  it("accepts an email and non-empty password", () => {
    expect(signInSchema.safeParse({ email: "person@example.com", password: "x" }).success).toBe(
      true,
    );
  });

  it("rejects an empty password", () => {
    expect(signInSchema.safeParse({ email: "person@example.com", password: "" }).success).toBe(
      false,
    );
  });

  it("does not enforce the 8-character minimum on sign-in (only sign-up)", () => {
    // A legacy account may predate a stricter password policy; sign-in only
    // needs *a* password, not one meeting today's minimum.
    expect(signInSchema.safeParse({ email: "person@example.com", password: "abc" }).success).toBe(
      true,
    );
  });
});

describe("requestPasswordResetSchema", () => {
  it("accepts a valid email", () => {
    expect(requestPasswordResetSchema.safeParse({ email: "person@example.com" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(requestPasswordResetSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("updatePasswordSchema", () => {
  it("accepts a valid password", () => {
    expect(updatePasswordSchema.safeParse({ password: "password123" }).success).toBe(true);
  });

  it("rejects a short password", () => {
    expect(updatePasswordSchema.safeParse({ password: "short" }).success).toBe(false);
  });
});
