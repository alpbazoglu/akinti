import { describe, expect, it } from "vitest";

import { buildWaveShareUrl, parseShareChannel } from "./shareChannels";

const WAVE_ID = "11111111-1111-4111-8111-111111111111";

describe("parseShareChannel", () => {
  it("accepts every known channel", () => {
    expect(parseShareChannel("link")).toBe("link");
    expect(parseShareChannel("message")).toBe("message");
    expect(parseShareChannel("native")).toBe("native");
  });

  it("rejects an unknown channel", () => {
    expect(parseShareChannel("like")).toBeNull();
    expect(parseShareChannel("")).toBeNull();
    expect(parseShareChannel("LINK")).toBeNull();
  });
});

describe("buildWaveShareUrl", () => {
  it("joins the origin and the Wave route", () => {
    expect(buildWaveShareUrl("https://akinti.app", WAVE_ID)).toBe(
      `https://akinti.app/w/${WAVE_ID}`,
    );
  });

  it("strips a trailing slash from the origin", () => {
    expect(buildWaveShareUrl("https://akinti.app/", WAVE_ID)).toBe(
      `https://akinti.app/w/${WAVE_ID}`,
    );
  });

  it("never embeds an audio URL — only the Wave route, which enforces visibility server-side", () => {
    const url = buildWaveShareUrl("https://akinti.app", WAVE_ID);
    expect(url).not.toContain("audio");
    expect(url).not.toContain("signed");
  });
});
