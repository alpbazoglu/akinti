import { afterEach, describe, expect, it } from "vitest";
import { getTranslations } from "next-intl/server";

import { __setMockLocale } from "@/test/next-intl-mock";
import type { MessageTranslator } from "@/lib/validation/translate";

import { mapAuthError } from "./errors";

/**
 * `mapAuthError` used to return hardcoded English (review3 finding 2) —
 * every message now resolves through the `AuthErrors` namespace via the
 * caller's own root translator, the same `getTranslations()` mock every
 * Server Action test in this codebase uses (`docs/I18N.md` §9 step 5:
 * asserting the Turkish text under a `tr` request is the strongest
 * guarantee a key actually resolves). Cast to the loose `MessageTranslator`
 * type, same as every production root-translator call site — see
 * `docs/I18N.md` §8.1 for why the real, strictly-keyed type isn't used here.
 */
async function getT(): Promise<MessageTranslator> {
  return (await getTranslations()) as MessageTranslator;
}

describe("mapAuthError", () => {
  afterEach(() => {
    __setMockLocale("en");
  });

  it("maps a known code to its English message", async () => {
    const t = await getT();
    expect(mapAuthError({ code: "invalid_credentials", message: "Invalid login credentials" }, t)).toBe(
      "That email and password combination is not correct.",
    );
  });

  it("maps the same code to Turkish under a tr request", async () => {
    __setMockLocale("tr");
    const t = await getT();
    expect(mapAuthError({ code: "invalid_credentials" }, t)).toBe("E-posta ve şifre eşleşmiyor.");
  });

  it("maps user_already_exists and email_exists to the same message", async () => {
    const t = await getT();
    const a = mapAuthError({ code: "user_already_exists" }, t);
    const b = mapAuthError({ code: "email_exists" }, t);
    expect(a).toBe(b);
    expect(a).toMatch(/already exists/i);
  });

  it("never echoes the raw Supabase message back to the caller", async () => {
    const t = await getT();
    const raw = "duplicate key value violates unique constraint \"profiles_username_key\"";
    const result = mapAuthError({ code: "weak_password", message: raw }, t);
    expect(result).not.toContain("duplicate key");
    expect(result).not.toContain("constraint");
  });

  it("falls back to a message-substring match when there is no code", async () => {
    const t = await getT();
    expect(mapAuthError({ message: "Invalid login credentials" }, t)).toBe(
      "That email and password combination is not correct.",
    );
    expect(mapAuthError({ message: "Email not confirmed" }, t)).toMatch(/confirm your email/i);
  });

  it("falls back to a generic message for an unrecognized error", async () => {
    const t = await getT();
    expect(mapAuthError({ code: "something_new_and_unmapped" }, t)).toBe(
      "Something went wrong. Try again in a moment.",
    );
    expect(mapAuthError({ message: "totally unexpected failure" }, t)).toBe(
      "Something went wrong. Try again in a moment.",
    );
  });

  it("handles null/undefined without throwing", async () => {
    const t = await getT();
    expect(mapAuthError(null, t)).toBe("Something went wrong. Try again in a moment.");
    expect(mapAuthError(undefined, t)).toBe("Something went wrong. Try again in a moment.");
  });

  it("maps a rate limit error", async () => {
    const t = await getT();
    expect(mapAuthError({ code: "over_request_rate_limit" }, t)).toMatch(/too many attempts/i);
  });
});
