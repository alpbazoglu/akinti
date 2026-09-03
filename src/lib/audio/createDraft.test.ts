import { describe, expect, it } from "vitest";

import type { CreateWaveDraft, CreateWaveDraftAudio } from "./createDraft";
import { WAVE_CATEGORY_OPTIONS } from "./createDraft";
import { defaultAdvancedEqSettings } from "./enhancement";

function makeAudio(overrides: Partial<CreateWaveDraftAudio> = {}): CreateWaveDraftAudio {
  return {
    creationType: "recorded",
    blob: new Blob(["fake-audio"], { type: "audio/webm" }),
    mimeType: "audio/webm",
    durationMs: 12_340,
    previewPeaks: [0.1, 0.4, 0.9, 0.3],
    enhancementPreset: "natural",
    advancedEq: null,
    sourceFileName: null,
    ...overrides,
  };
}

describe("CreateWaveDraft shape", () => {
  it("accepts a minimal recorded draft with no optional fields set", () => {
    const draft: CreateWaveDraft = {
      audio: makeAudio(),
      title: "Late night take",
      description: "",
      visibility: "everyone",
      commentPermission: null,
      duetPermission: null,
      collaboratorUsernames: [],
      categories: [],
    };

    expect(draft.audio.creationType).toBe("recorded");
    expect(draft.audio.blob).toBeInstanceOf(Blob);
    expect(draft.commentPermission).toBeNull();
    expect(draft.collaboratorUsernames).toEqual([]);
  });

  it("accepts an uploaded draft with a source filename, permissions, collaborators, categories and EQ", () => {
    const draft: CreateWaveDraft = {
      audio: makeAudio({
        creationType: "uploaded",
        sourceFileName: "verse-two.mp3",
        enhancementPreset: "studio",
        advancedEq: defaultAdvancedEqSettings(),
      }),
      title: "Verse two",
      description: "Second pass, open to feedback.",
      visibility: "followers",
      commentPermission: "everyone",
      duetPermission: "following",
      collaboratorUsernames: ["maria", "alex"],
      categories: ["Music", "Talk"],
    };

    expect(draft.audio.creationType).toBe("uploaded");
    expect(draft.audio.sourceFileName).toBe("verse-two.mp3");
    expect(draft.audio.advancedEq).not.toBeNull();
    expect(draft.collaboratorUsernames).toHaveLength(2);
    expect(draft.categories).toEqual(["Music", "Talk"]);
  });

  it("never types 'duet' as a creatable creation type", () => {
    // Compile-time guarantee: TypeScript rejects "duet" for CreateWaveDraftAudio.creationType.
    // @ts-expect-error a Wave may only be created as recorded or uploaded (spec §15) — Duet
    // is produced by the Duet flow, never by this form.
    const invalid: CreateWaveDraftAudio = makeAudio({ creationType: "duet" });
    expect(invalid).toBeDefined();
  });

  it("exposes a non-empty, deduplicated category list", () => {
    expect(WAVE_CATEGORY_OPTIONS.length).toBeGreaterThan(0);
    expect(new Set(WAVE_CATEGORY_OPTIONS).size).toBe(WAVE_CATEGORY_OPTIONS.length);
  });
});
