import { describe, expect, it } from "vitest";

import {
  buildAdvancedEqFilter,
  buildDuetMixFilterComplex,
  buildProcessAudioFilterChain,
  composeFilterChain,
  parseMixDuetJobPayload,
} from "./ffmpegChain";

describe("buildAdvancedEqFilter", () => {
  it("returns null when no EQ payload is given", () => {
    expect(buildAdvancedEqFilter(null)).toBeNull();
    expect(buildAdvancedEqFilter(undefined)).toBeNull();
  });

  it("builds one equalizer filter per band, in band order, defaulting missing bands to 0 dB", () => {
    const filter = buildAdvancedEqFilter({ 60: 4, 1000: -3 });
    expect(filter).toBe(
      "equalizer=f=60:t=q:w=1:g=4," +
        "equalizer=f=250:t=q:w=1:g=0," +
        "equalizer=f=1000:t=q:w=1:g=-3," +
        "equalizer=f=4000:t=q:w=1:g=0," +
        "equalizer=f=12000:t=q:w=1:g=0",
    );
  });

  it("clamps gain to +/-12 dB", () => {
    const filter = buildAdvancedEqFilter({ 60: 999, 250: -999 });
    expect(filter).toContain("f=60:t=q:w=1:g=12");
    expect(filter).toContain("f=250:t=q:w=1:g=-12");
  });
});

describe("composeFilterChain / buildProcessAudioFilterChain", () => {
  it("returns the base chain unchanged when there is no EQ", () => {
    expect(composeFilterChain("loudnorm=I=-16", null)).toBe("loudnorm=I=-16");
    expect(buildProcessAudioFilterChain("loudnorm=I=-16", null)).toBe("loudnorm=I=-16");
  });

  it("appends the EQ chain after the preset chain with a comma", () => {
    const result = buildProcessAudioFilterChain("loudnorm=I=-16", { 60: 2 });
    expect(result.startsWith("loudnorm=I=-16,equalizer=f=60:t=q:w=1:g=2")).toBe(true);
  });
});

describe("buildDuetMixFilterComplex", () => {
  it("delays only the contribution for a positive offset", () => {
    const result = buildDuetMixFilterComplex({ offsetMs: 1240, presetFilter: "loudnorm=I=-14" });
    expect(result.contributionDelayMs).toBe(1240);
    expect(result.referenceDelayMs).toBe(0);
    expect(result.filterComplex).toBe(
      "[1:a]adelay=1240:all=1,loudnorm=I=-14[contrib];" +
        "[0:a]adelay=0:all=1[ref];" +
        "[ref][contrib]amix=inputs=2:duration=longest:dropout_transition=2[mixed]",
    );
    expect(result.outputMap).toBe("[mixed]");
  });

  it("delays only the reference for a negative offset — adelay itself never receives a negative value", () => {
    const result = buildDuetMixFilterComplex({ offsetMs: -800, presetFilter: "loudnorm=I=-14" });
    expect(result.contributionDelayMs).toBe(0);
    expect(result.referenceDelayMs).toBe(800);
    expect(result.filterComplex).toContain("[1:a]adelay=0:all=1,loudnorm=I=-14[contrib]");
    expect(result.filterComplex).toContain("[0:a]adelay=800:all=1[ref]");
    expect(result.filterComplex).not.toMatch(/adelay=-/);
  });

  it("delays neither stem when the offset is zero", () => {
    const result = buildDuetMixFilterComplex({ offsetMs: 0, presetFilter: "loudnorm=I=-14" });
    expect(result.contributionDelayMs).toBe(0);
    expect(result.referenceDelayMs).toBe(0);
  });

  it("rounds a fractional offset before building the graph", () => {
    const result = buildDuetMixFilterComplex({ offsetMs: 1240.6, presetFilter: "loudnorm=I=-14" });
    expect(result.contributionDelayMs).toBe(1241);
  });

  it("applies the preset filter only to the contribution stem, never to the reference or the mixed output", () => {
    const result = buildDuetMixFilterComplex({ offsetMs: 500, presetFilter: "afftdn=nf=-25" });
    expect(result.filterComplex).toContain("[contrib];[0:a]adelay=0:all=1[ref]");
    expect(result.filterComplex.split("amix")[1]).not.toContain("afftdn");
  });

  it("chains the advanced EQ after the preset filter on the contribution stem", () => {
    const result = buildDuetMixFilterComplex({
      offsetMs: 200,
      presetFilter: "loudnorm=I=-14",
      advancedEq: { 60: 5 },
    });
    expect(result.filterComplex).toContain(
      "[1:a]adelay=200:all=1,loudnorm=I=-14,equalizer=f=60:t=q:w=1:g=5," +
        "equalizer=f=250:t=q:w=1:g=0,equalizer=f=1000:t=q:w=1:g=0," +
        "equalizer=f=4000:t=q:w=1:g=0,equalizer=f=12000:t=q:w=1:g=0[contrib]",
    );
  });

  it("omits the EQ segment entirely when no advanced EQ is given", () => {
    const result = buildDuetMixFilterComplex({ offsetMs: 200, presetFilter: "loudnorm=I=-14" });
    expect(result.filterComplex).toContain("[1:a]adelay=200:all=1,loudnorm=I=-14[contrib]");
    expect(result.filterComplex).not.toContain("equalizer");
  });
});

describe("parseMixDuetJobPayload", () => {
  it("parses a well-formed payload", () => {
    const parsed = parseMixDuetJobPayload({
      preset: "studio",
      reference_asset_id: "asset-1",
      offset_ms: -250,
      advanced_eq: { 60: 3 },
    });
    expect(parsed).toEqual({
      preset: "studio",
      referenceAssetId: "asset-1",
      offsetMs: -250,
      advancedEq: { 60: 3 },
    });
  });

  it("defaults advancedEq to null and preset to undefined when absent", () => {
    const parsed = parseMixDuetJobPayload({ reference_asset_id: "asset-1", offset_ms: 0 });
    expect(parsed).toEqual({
      preset: undefined,
      referenceAssetId: "asset-1",
      offsetMs: 0,
      advancedEq: null,
    });
  });

  it("returns null for a payload missing the required fields", () => {
    expect(parseMixDuetJobPayload({})).toBeNull();
    expect(parseMixDuetJobPayload(null)).toBeNull();
    expect(parseMixDuetJobPayload({ reference_asset_id: "asset-1" })).toBeNull();
    expect(parseMixDuetJobPayload("not an object")).toBeNull();
  });
});
