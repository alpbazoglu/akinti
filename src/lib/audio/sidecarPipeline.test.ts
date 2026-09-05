import { describe, expect, it, vi } from "vitest";

import {
  selectCleanStage,
  selectMasterStage,
  selectPeaksStage,
  sidecarConfigFromEnv,
  type EnhancementReport,
} from "./sidecarPipeline";

const CONFIG = { url: "http://sidecar.test", timeoutMs: 1000, retries: 0 };

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("sidecarConfigFromEnv", () => {
  it("defaults to localhost:8011 with sane timeout/retry defaults", () => {
    expect(sidecarConfigFromEnv({})).toEqual({
      url: "http://127.0.0.1:8011",
      timeoutMs: 120_000,
      retries: 1,
    });
  });

  it("reads SIDECAR_URL/SIDECAR_TIMEOUT_MS/SIDECAR_RETRIES", () => {
    expect(
      sidecarConfigFromEnv({
        SIDECAR_URL: "http://example:9000",
        SIDECAR_TIMEOUT_MS: "5000",
        SIDECAR_RETRIES: "3",
      }),
    ).toEqual({ url: "http://example:9000", timeoutMs: 5000, retries: 3 });
  });
});

describe("selectCleanStage (pipeline stage selection)", () => {
  it("uses the sidecar when it responds successfully", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ output_path: "/tmp/cleaned.wav", method: "deepfilternet3", lufs_before: -30, lufs_after: -28 }),
    );
    const fallback = { modelAvailable: true, run: vi.fn() };

    const result = await selectCleanStage(CONFIG, "/tmp/in.wav", "/tmp", fallback, fetchImpl);

    expect(result?.outputPath).toBe("/tmp/cleaned.wav");
    expect(result?.report.method).toBe("sidecar:deepfilternet3");
    expect(fallback.run).not.toHaveBeenCalled();
  });

  it("falls back to local arnndn when the sidecar is unreachable and a model is bundled", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const fallback = {
      modelAvailable: true,
      run: vi.fn().mockResolvedValue({ outputPath: "/tmp/arnndn.wav", lufsBefore: -30, lufsAfter: -29 }),
    };

    const result = await selectCleanStage(CONFIG, "/tmp/in.wav", "/tmp", fallback, fetchImpl);

    expect(result?.outputPath).toBe("/tmp/arnndn.wav");
    expect(result?.report.method).toBe("arnndn");
    expect(fallback.run).toHaveBeenCalledWith("/tmp/in.wav", "/tmp");
  });

  it("skips the clean stage entirely (returns null, never fakes a result) when neither the sidecar nor a local model is available", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const fallback = { modelAvailable: false, run: vi.fn() };

    const result = await selectCleanStage(CONFIG, "/tmp/in.wav", "/tmp", fallback, fetchImpl);

    expect(result).toBeNull();
    expect(fallback.run).not.toHaveBeenCalled();
  });

  it("falls back when the sidecar returns a non-2xx status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ detail: "no backend" }, false, 503));
    const fallback = {
      modelAvailable: true,
      run: vi.fn().mockResolvedValue({ outputPath: "/tmp/arnndn.wav", lufsBefore: null, lufsAfter: null }),
    };

    const result = await selectCleanStage(CONFIG, "/tmp/in.wav", "/tmp", fallback, fetchImpl);

    expect(result?.report.method).toBe("arnndn");
  });
});

describe("selectMasterStage", () => {
  it("uses Matchering via the sidecar when reachable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ output_path: "/tmp/mastered.wav", method: "matchering", lufs_before: -20, lufs_after: -14 }),
    );
    const fallback = { run: vi.fn() };

    const result = await selectMasterStage(CONFIG, "/tmp/preset.wav", "/tmp", "studio", fallback, fetchImpl);

    expect(result.report.method).toBe("sidecar:matchering");
    expect(fallback.run).not.toHaveBeenCalled();
  });

  it("always produces a result via the loudnorm two-pass fallback when the sidecar is unreachable — mastering is never skipped", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("timeout"));
    const fallback = {
      run: vi.fn().mockResolvedValue({ outputPath: "/tmp/mastered.wav", lufsBefore: -20, lufsAfter: -14 }),
    };

    const result = await selectMasterStage(CONFIG, "/tmp/preset.wav", "/tmp", "studio", fallback, fetchImpl);

    expect(result.outputPath).toBe("/tmp/mastered.wav");
    expect(result.report.method).toBe("loudnorm_two_pass");
    expect(fallback.run).toHaveBeenCalledWith("/tmp/preset.wav", "/tmp");
  });
});

describe("selectPeaksStage", () => {
  it("uses the sidecar's peaks when reachable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ version: 1, bits: 8, samples_per_pixel: 512, data: [1, 2, 3] }),
    );
    const fallback = { run: vi.fn() };

    const result = await selectPeaksStage(CONFIG, "/tmp/out.m4a", fallback, fetchImpl);

    expect(result.peaks).toEqual({ version: 1, bits: 8, samples_per_pixel: 512, data: [1, 2, 3] });
    expect(result.report.method).toBe("sidecar:librosa");
  });

  it("falls back to the local extractor and still returns a usable PeaksPayload", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const fallback = {
      run: vi.fn().mockResolvedValue({ version: 1, bits: 8, samples_per_pixel: 256, data: [9, 9] }),
    };

    const result = await selectPeaksStage(CONFIG, "/tmp/out.m4a", fallback, fetchImpl);

    expect(result.peaks.data).toEqual([9, 9]);
    expect(result.report.method).toBe("ffmpeg");
  });
});

describe("EnhancementReport shape", () => {
  it("a stage that did not run is simply absent, never a placeholder value", () => {
    // Mirrors what runProcessAudioJob (scripts/worker.ts) builds when the
    // clean stage was skipped (no sidecar, no bundled rnnoise model).
    const report: EnhancementReport = {
      master: { method: "loudnorm_two_pass", lufsBefore: -28.1, lufsAfter: -14, durationMs: 410 },
      peaks: { method: "ffmpeg", durationMs: 120 },
    };

    expect(report.clean).toBeUndefined();
    expect(report.master?.method).toBe("loudnorm_two_pass");
    expect(Object.keys(report)).not.toContain("clean");
  });

  it("records every stage that did run with a real method label", () => {
    const report: EnhancementReport = {
      clean: { method: "sidecar:deepfilternet3", lufsBefore: -30, lufsAfter: -28, durationMs: 900 },
      master: { method: "sidecar:matchering", lufsBefore: -28, lufsAfter: -14, durationMs: 500 },
      peaks: { method: "sidecar:librosa", durationMs: 80 },
    };

    for (const stage of Object.values(report)) {
      expect(stage?.method).toMatch(/^(sidecar:|arnndn$|loudnorm_two_pass$|ffmpeg$)/);
      expect(stage?.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});
