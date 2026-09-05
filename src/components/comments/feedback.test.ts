import { describe, expect, it } from "vitest";

import { composeFeedback, parseFeedback } from "./feedback";

describe("composeFeedback", () => {
  it("writes one labelled line per answered prompt", () => {
    expect(composeFeedback({ worked: "The intro", note: "Chorus runs flat" })).toBe(
      "What worked: The intro\nPitch or timing: Chorus runs flat",
    );
  });

  it("keeps the prompts in their asked order", () => {
    expect(composeFeedback({ try: "Take it down", worked: "The intro" })).toBe(
      "What worked: The intro\nOne thing to try: Take it down",
    );
  });

  it("leaves no trace of an unanswered prompt", () => {
    expect(composeFeedback({ worked: "The intro", note: "   " })).toBe("What worked: The intro");
  });

  it("produces nothing at all when nothing was answered", () => {
    expect(composeFeedback({})).toBe("");
  });
});

describe("parseFeedback", () => {
  it("reads back exactly what compose wrote", () => {
    const fields = { worked: "The intro", note: "Chorus runs flat", try: "Take it down" };
    const parsed = parseFeedback(composeFeedback(fields));
    expect(parsed).toEqual([
      { key: "worked", label: "What worked", value: "The intro" },
      { key: "note", label: "Pitch or timing", value: "Chorus runs flat" },
      { key: "try", label: "One thing to try", value: "Take it down" },
    ]);
  });

  it("treats an ordinary comment as prose", () => {
    expect(parseFeedback("Bu geçiş çok iyi olmuş.")).toBeNull();
    expect(parseFeedback("")).toBeNull();
  });

  it("does not reshape a comment that only starts like feedback", () => {
    expect(parseFeedback("What worked: the intro\nand then I rambled")).toBeNull();
  });

  it("rejects a labelled line with nothing after it", () => {
    expect(parseFeedback("What worked:")).toBeNull();
  });

  it("rejects a repeated prompt", () => {
    expect(parseFeedback("What worked: a\nWhat worked: b")).toBeNull();
  });

  it("accepts a single answered prompt", () => {
    expect(parseFeedback("One thing to try: slower")).toEqual([
      { key: "try", label: "One thing to try", value: "slower" },
    ]);
  });
});
