import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, localeFromAcceptLanguage, resolveLocale } from "./locale";

describe("resolveLocale", () => {
  it("prefers the profile locale over everything else", () => {
    expect(
      resolveLocale({ profileLocale: "en", cookieValue: "tr", acceptLanguage: "tr-TR" }),
    ).toBe("en");
  });

  it("falls back to the cookie when the profile has no preference", () => {
    expect(
      resolveLocale({ profileLocale: null, cookieValue: "tr", acceptLanguage: "en-US" }),
    ).toBe("tr");
  });

  it("ignores an invalid profile value and falls through to the cookie", () => {
    expect(
      resolveLocale({ profileLocale: "fr", cookieValue: "en", acceptLanguage: "tr-TR" }),
    ).toBe("en");
  });

  it("ignores an invalid cookie value and falls through to Accept-Language", () => {
    expect(
      resolveLocale({ profileLocale: null, cookieValue: "de", acceptLanguage: "tr-TR" }),
    ).toBe("tr");
  });

  it("falls back to Accept-Language when neither the profile nor the cookie has a value", () => {
    expect(resolveLocale({ acceptLanguage: "tr-TR,tr;q=0.9" })).toBe("tr");
    expect(resolveLocale({ acceptLanguage: "en-US,en;q=0.9" })).toBe("en");
  });

  it("defaults to English when nothing at all is available", () => {
    expect(resolveLocale({})).toBe(DEFAULT_LOCALE);
  });
});

describe("localeFromAcceptLanguage", () => {
  it("detects Turkish anywhere in a ranked header, not just first place", () => {
    expect(localeFromAcceptLanguage("fr-FR,fr;q=0.9,tr;q=0.5")).toBe("tr");
  });

  it("treats a missing header as English", () => {
    expect(localeFromAcceptLanguage(null)).toBe("en");
    expect(localeFromAcceptLanguage(undefined)).toBe("en");
  });

  it("treats an unrelated language as English", () => {
    expect(localeFromAcceptLanguage("de-DE,de;q=0.9")).toBe("en");
  });
});
