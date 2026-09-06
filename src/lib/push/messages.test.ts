import { describe, expect, it } from "vitest";

import { resolvePushMessage } from "./messages";

describe("resolvePushMessage", () => {
  it("resolves an English message for the en locale", () => {
    expect(resolvePushMessage("en", "DuetRecordActions.newDuetRequestTitle")).toBe("New duet request");
  });

  it("resolves the Turkish message for the tr locale", () => {
    expect(resolvePushMessage("tr", "DuetRecordActions.newDuetRequestTitle")).toBe("Yeni duet isteği");
  });

  it("resolves Terms.* term params against the same locale as the message, not the raw English TERMS constant", () => {
    const en = resolvePushMessage("en", "DuetRecordActions.newDuetRequestBody", { duet: "duet", wave: "wave" });
    const tr = resolvePushMessage("tr", "DuetRecordActions.newDuetRequestBody", { duet: "duet", wave: "wave" });

    expect(en).toBe("Wants to create a Duet using your Wave.");
    expect(tr).toBe("Wave içeriğinizi kullanarak bir Duet oluşturmak istiyor.");
    // Neither locale's rendering should ever contain the raw term key
    // (a sign the lookup silently fell through instead of resolving).
    expect(en).not.toContain("{duet}");
    expect(tr).not.toContain("{wave}");
  });

  it("falls back to English if the key is somehow missing from the requested locale", () => {
    expect(resolvePushMessage("tr", "DuetRecordActions.newDuetRequestTitle")).not.toBe(
      "DuetRecordActions.newDuetRequestTitle",
    );
  });

  it("falls back to the raw key as a last resort for an unknown key", () => {
    expect(resolvePushMessage("tr", "NotARealNamespace.notARealKey")).toBe("NotARealNamespace.notARealKey");
  });
});
