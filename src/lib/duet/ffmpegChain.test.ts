import { describe, expect, it } from "vitest";

import {
  buildAdvancedEqFilter,
  buildAtismaMixFilterComplex,
  buildCypherMixFilterComplex,
  buildDuetMixFilterComplex,
  buildProcessAudioFilterChain,
  composeFilterChain,
  parseMixDuetJobPayload,
  validateDuetSegments,
  type DuetSegment,
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

  it("applies no gain to the reference stem by default (ordinary Duet)", () => {
    const result = buildDuetMixFilterComplex({ offsetMs: 0, presetFilter: "loudnorm=I=-14" });
    expect(result.filterComplex).toContain("[0:a]adelay=0:all=1[ref]");
    expect(result.filterComplex).not.toContain("volume=");
  });

  it("attenuates the reference stem when referenceGainDb is set (backing-track mix, spec §4)", () => {
    const result = buildDuetMixFilterComplex({
      offsetMs: 0,
      presetFilter: "loudnorm=I=-14",
      referenceGainDb: -6,
    });
    expect(result.filterComplex).toContain("[0:a]adelay=0:all=1,volume=-6dB[ref]");
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
      referenceGainDb: 0,
      mode: "layer",
      segments: null,
    });
  });

  it("defaults advancedEq to null, referenceGainDb to 0, and preset to undefined when absent", () => {
    const parsed = parseMixDuetJobPayload({ reference_asset_id: "asset-1", offset_ms: 0 });
    expect(parsed).toEqual({
      preset: undefined,
      referenceAssetId: "asset-1",
      offsetMs: 0,
      advancedEq: null,
      referenceGainDb: 0,
      mode: "layer",
      segments: null,
    });
  });

  it("reads a non-zero reference_gain_db (backing-track mix)", () => {
    const parsed = parseMixDuetJobPayload({
      reference_asset_id: "track-asset-1",
      offset_ms: 0,
      reference_gain_db: -6,
    });
    expect(parsed?.referenceGainDb).toBe(-6);
  });

  it("returns null for a payload missing the required fields", () => {
    expect(parseMixDuetJobPayload({})).toBeNull();
    expect(parseMixDuetJobPayload(null)).toBeNull();
    expect(parseMixDuetJobPayload({ reference_asset_id: "asset-1" })).toBeNull();
    expect(parseMixDuetJobPayload("not an object")).toBeNull();
  });

  it("defaults mode to 'layer' and segments to null when absent (pre-Wave-D payloads)", () => {
    const parsed = parseMixDuetJobPayload({ reference_asset_id: "asset-1", offset_ms: 0 });
    expect(parsed?.mode).toBe("layer");
    expect(parsed?.segments).toBeNull();
  });

  it("parses mode and segments for an atisma payload", () => {
    const parsed = parseMixDuetJobPayload({
      reference_asset_id: "asset-1",
      offset_ms: 0,
      mode: "atisma",
      segments: [
        { source: "original", startMs: 0, endMs: 1000 },
        { source: "contribution", startMs: 0, endMs: 1200 },
      ],
    });
    expect(parsed?.mode).toBe("atisma");
    expect(parsed?.segments).toEqual([
      { source: "original", startMs: 0, endMs: 1000 },
      { source: "contribution", startMs: 0, endMs: 1200 },
    ]);
  });

  it("parses mode 'cypher' with segments null (segments are atisma-only)", () => {
    const parsed = parseMixDuetJobPayload({
      reference_asset_id: "asset-1",
      offset_ms: 0,
      mode: "cypher",
      segments: [{ source: "original", startMs: 0, endMs: 1000 }],
    });
    expect(parsed?.mode).toBe("cypher");
    expect(parsed?.segments).toBeNull();
  });
});

describe("validateDuetSegments", () => {
  it("rejects an empty segment list", () => {
    expect(() => validateDuetSegments([])).toThrow(/at least one segment/);
  });

  it("rejects more than the maximum number of segments", () => {
    const segments: DuetSegment[] = Array.from({ length: 41 }, (_, i) => ({
      source: i % 2 === 0 ? "original" : "contribution",
      startMs: i * 100,
      endMs: i * 100 + 50,
    }));
    expect(() => validateDuetSegments(segments)).toThrow(/at most 40 segments/);
  });

  it("rejects a segment whose end is not after its start", () => {
    expect(() =>
      validateDuetSegments([{ source: "original", startMs: 1000, endMs: 1000 }]),
    ).toThrow(/Invalid segment bounds/);
  });

  it("rejects a negative start", () => {
    expect(() =>
      validateDuetSegments([{ source: "original", startMs: -1, endMs: 100 }]),
    ).toThrow(/Invalid segment bounds/);
  });

  it("rejects overlapping segments within the same source", () => {
    expect(() =>
      validateDuetSegments([
        { source: "original", startMs: 0, endMs: 1000 },
        { source: "original", startMs: 500, endMs: 1500 },
      ]),
    ).toThrow(/monotonic and non-overlapping/);
  });

  it("allows interleaved sources whose own timelines are each monotonic", () => {
    expect(() =>
      validateDuetSegments([
        { source: "original", startMs: 0, endMs: 1000 },
        { source: "contribution", startMs: 0, endMs: 1200 },
        { source: "original", startMs: 1000, endMs: 2000 },
        { source: "contribution", startMs: 1200, endMs: 2400 },
      ]),
    ).not.toThrow();
  });

  it("rejects a total duration over the maximum", () => {
    expect(() =>
      validateDuetSegments([{ source: "original", startMs: 0, endMs: 30 * 60 * 1000 + 1 }]),
    ).toThrow(/maximum/);
  });
});

describe("buildAtismaMixFilterComplex", () => {
  it("throws on an empty segment list", () => {
    expect(() => buildAtismaMixFilterComplex([])).toThrow(/at least one segment/);
  });

  it("throws on overlapping segments", () => {
    expect(() =>
      buildAtismaMixFilterComplex([
        { source: "contribution", startMs: 0, endMs: 1000 },
        { source: "contribution", startMs: 500, endMs: 1500 },
      ]),
    ).toThrow(/monotonic and non-overlapping/);
  });

  it("throws when the total exceeds the maximum duration", () => {
    expect(() =>
      buildAtismaMixFilterComplex([{ source: "original", startMs: 0, endMs: 30 * 60 * 1000 + 1 }]),
    ).toThrow(/maximum/);
  });

  it("builds a single atrim with no crossfade for one segment", () => {
    const result = buildAtismaMixFilterComplex([{ source: "original", startMs: 0, endMs: 1000 }]);
    expect(result.segmentCount).toBe(1);
    expect(result.outputMap).toBe("[mixed]");
    expect(result.filterComplex).toBe(
      "[0:a]atrim=start=0.000:end=1.000,asetpts=PTS-STARTPTS[seg0];[seg0]anull[mixed]",
    );
  });

  it("selects input 0 for 'original' segments and input 1 for 'contribution' segments", () => {
    const result = buildAtismaMixFilterComplex([
      { source: "original", startMs: 0, endMs: 1000 },
      { source: "contribution", startMs: 0, endMs: 1000 },
    ]);
    expect(result.filterComplex).toContain("[0:a]atrim=start=0.000:end=1.000");
    expect(result.filterComplex).toContain("[1:a]atrim=start=0.000:end=1.000");
  });

  it("crossfades consecutive segments pairwise, folding left", () => {
    const result = buildAtismaMixFilterComplex(
      [
        { source: "original", startMs: 0, endMs: 1000 },
        { source: "contribution", startMs: 0, endMs: 1000 },
        { source: "original", startMs: 1000, endMs: 2000 },
      ],
      { crossfadeMs: 40 },
    );
    expect(result.segmentCount).toBe(3);
    expect(result.filterComplex).toContain("[seg0][seg1]acrossfade=d=0.040:c1=tri:c2=tri[xf1]");
    expect(result.filterComplex).toContain("[xf1][seg2]acrossfade=d=0.040:c1=tri:c2=tri[mixed]");
  });

  it("clamps the crossfade duration down for a very short segment rather than erroring", () => {
    const result = buildAtismaMixFilterComplex(
      [
        { source: "original", startMs: 0, endMs: 20 },
        { source: "contribution", startMs: 0, endMs: 1000 },
      ],
      { crossfadeMs: 40 },
    );
    expect(result.filterComplex).toContain("acrossfade=d=0.020:c1=tri:c2=tri[mixed]");
  });

  it("enhances contribution-sourced segments only, leaving original segments untouched", () => {
    const result = buildAtismaMixFilterComplex(
      [
        { source: "original", startMs: 0, endMs: 1000 },
        { source: "contribution", startMs: 0, endMs: 1000 },
      ],
      { presetFilter: "loudnorm=I=-14" },
    );
    expect(result.filterComplex).toContain(
      "[0:a]atrim=start=0.000:end=1.000,asetpts=PTS-STARTPTS[seg0]",
    );
    expect(result.filterComplex).toContain(
      "[1:a]atrim=start=0.000:end=1.000,asetpts=PTS-STARTPTS,loudnorm=I=-14[seg1]",
    );
  });
});

describe("buildCypherMixFilterComplex", () => {
  it("applies the preset to the contribution stem only, then concatenates after the parent", () => {
    const result = buildCypherMixFilterComplex({ presetFilter: "loudnorm=I=-14" });
    expect(result.filterComplex).toBe(
      "[1:a]loudnorm=I=-14[contrib];[0:a][contrib]concat=n=2:v=0:a=1[mixed]",
    );
    expect(result.outputMap).toBe("[mixed]");
  });

  it("chains the advanced EQ after the preset on the contribution stem", () => {
    const result = buildCypherMixFilterComplex({ presetFilter: "loudnorm=I=-14", advancedEq: { 60: 5 } });
    expect(result.filterComplex).toContain("[1:a]loudnorm=I=-14,equalizer=f=60:t=q:w=1:g=5");
  });

  it("never applies the preset to input 0 (the parent's already-rendered audio)", () => {
    const result = buildCypherMixFilterComplex({ presetFilter: "afftdn=nf=-25" });
    expect(result.filterComplex.split(";")[1]).not.toContain("afftdn");
  });
});
