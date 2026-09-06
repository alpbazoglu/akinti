import { afterEach, describe, expect, it } from "vitest";

import { __setMockLocale, useTranslations } from "./next-intl-mock";

/**
 * Review3 finding 25: the mock's `interpolate` used to be a naive
 * `{placeholder}` replaceAll, so a component test rendering a real ICU
 * plural message (`WaveCard.metricPlays`, twelve messages use this shape)
 * asserted against the raw ICU source string and passed, while production
 * correctly rendered "1 play"/"3 plays". Now that the mock goes through
 * `use-intl`'s real `createTranslator`, this asserts the actual rendered
 * plural form in both locales next-intl ships.
 */
describe("next-intl-mock ICU plural handling", () => {
  afterEach(() => {
    __setMockLocale("en");
  });

  it("resolves the English singular/plural branches, not the raw ICU source", () => {
    const t = useTranslations("WaveCard");
    expect(t("metricPlays", { count: 1 })).toBe("play");
    expect(t("metricPlays", { count: 3 })).toBe("plays");
  });

  it("resolves Turkish, which does not vary by count (docs/I18N.md §5)", () => {
    __setMockLocale("tr");
    const t = useTranslations("WaveCard");
    expect(t("metricPlays", { count: 1 })).toBe("oynanma");
    expect(t("metricPlays", { count: 3 })).toBe("oynanma");
  });
});
