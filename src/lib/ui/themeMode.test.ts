import { describe, expect, it } from "vitest";

import { isThemeMode, resolveThemeMode, themeModeToDataAttribute } from "./themeMode";

describe("isThemeMode", () => {
  it("accepts the three curated modes", () => {
    expect(isThemeMode("system")).toBe(true);
    expect(isThemeMode("light")).toBe(true);
    expect(isThemeMode("dark")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isThemeMode("auto")).toBe(false);
    expect(isThemeMode(null)).toBe(false);
    expect(isThemeMode(undefined)).toBe(false);
  });
});

describe("resolveThemeMode", () => {
  it("passes through a valid cookie value", () => {
    expect(resolveThemeMode("dark")).toBe("dark");
    expect(resolveThemeMode("light")).toBe("light");
  });

  it("defaults to system for missing/invalid values", () => {
    expect(resolveThemeMode(null)).toBe("system");
    expect(resolveThemeMode(undefined)).toBe("system");
    expect(resolveThemeMode("nonsense")).toBe("system");
  });
});

describe("themeModeToDataAttribute", () => {
  it("omits the attribute for system", () => {
    expect(themeModeToDataAttribute("system")).toBeUndefined();
  });

  it("passes light/dark through unchanged", () => {
    expect(themeModeToDataAttribute("light")).toBe("light");
    expect(themeModeToDataAttribute("dark")).toBe("dark");
  });
});
