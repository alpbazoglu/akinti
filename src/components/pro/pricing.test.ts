import { afterEach, describe, expect, it } from "vitest";

import {
  DECIDED_MONTHLY_AMOUNT,
  detectProCurrency,
  formatProPrice,
  hasSeededYearlyPlan,
  planCodeFor,
  resolvePlanAmount,
  type ProPlanSummary,
} from "./pricing";

describe("planCodeFor", () => {
  it("maps currency and interval to the four real plan codes", () => {
    expect(planCodeFor("TRY", "month")).toBe("pro_monthly_try");
    expect(planCodeFor("TRY", "year")).toBe("pro_yearly_try");
    expect(planCodeFor("USD", "month")).toBe("pro_monthly_usd");
    expect(planCodeFor("USD", "year")).toBe("pro_yearly_usd");
  });
});

describe("detectProCurrency", () => {
  const originalLanguageDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "language");

  afterEach(() => {
    if (originalLanguageDescriptor) {
      Object.defineProperty(window.navigator, "language", originalLanguageDescriptor);
    }
  });

  it("prefers a Turkish locale hint over the browser language", () => {
    Object.defineProperty(window.navigator, "language", { value: "en-US", configurable: true });
    expect(detectProCurrency("tr-TR")).toBe("TRY");
  });

  it("falls back to the browser language when no locale hint is given", () => {
    Object.defineProperty(window.navigator, "language", { value: "tr-TR", configurable: true });
    expect(detectProCurrency()).toBe("TRY");
  });

  it("defaults to USD for anything else", () => {
    Object.defineProperty(window.navigator, "language", { value: "en-US", configurable: true });
    expect(detectProCurrency("en-US")).toBe("USD");
    expect(detectProCurrency(null)).toBe("USD");
  });
});

describe("resolvePlanAmount / hasSeededYearlyPlan", () => {
  it("uses the decided monthly amount when no plan is seeded", () => {
    expect(resolvePlanAmount([], "TRY", "month")).toBe(DECIDED_MONTHLY_AMOUNT.TRY);
    expect(resolvePlanAmount([], "USD", "month")).toBe(DECIDED_MONTHLY_AMOUNT.USD);
  });

  it("never guesses a yearly amount when nothing is seeded", () => {
    expect(resolvePlanAmount([], "TRY", "year")).toBeNull();
    expect(hasSeededYearlyPlan([], "TRY")).toBe(false);
  });

  it("prefers a seeded row's real amount over the decided default", () => {
    const plans: ProPlanSummary[] = [
      { code: "pro_monthly_try", amount: 8999, currency: "TRY", interval: "month" },
      { code: "pro_yearly_try", amount: 79999, currency: "TRY", interval: "year" },
    ];
    expect(resolvePlanAmount(plans, "TRY", "month")).toBe(8999);
    expect(resolvePlanAmount(plans, "TRY", "year")).toBe(79999);
    expect(hasSeededYearlyPlan(plans, "TRY")).toBe(true);
    expect(hasSeededYearlyPlan(plans, "USD")).toBe(false);
  });
});

describe("formatProPrice", () => {
  it("formats USD with a dollar sign and two decimals", () => {
    expect(formatProPrice(499, "USD")).toBe("$4.99");
  });

  it("formats TRY with the lira symbol", () => {
    const formatted = formatProPrice(7999, "TRY");
    expect(formatted).toContain("79,99");
    expect(formatted).toMatch(/₺/);
  });
});
