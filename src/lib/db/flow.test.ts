import { describe, expect, it } from "vitest";

import { countFlowNew, decodeFlowCursor, encodeFlowCursor, getFlowPage, recordFlowEvent } from "./flow";
import type { Db } from "./types";
import type { FlowFeedRankRow } from "@/types/database";

describe("encodeFlowCursor / decodeFlowCursor", () => {
  it("round-trips a full cursor", () => {
    const cursor = { bucket: 4, score: -12.5, id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", slot: 30 };
    expect(decodeFlowCursor(encodeFlowCursor(cursor))).toEqual(cursor);
  });

  it("round-trips a cursor with null bucket/score/id (ranked stream never produced a row)", () => {
    const cursor = { bucket: null, score: null, id: null, slot: 8 };
    expect(decodeFlowCursor(encodeFlowCursor(cursor))).toEqual(cursor);
  });

  it("round-trips slot 0", () => {
    const cursor = { bucket: 1, score: -100, id: "id-a", slot: 0 };
    expect(decodeFlowCursor(encodeFlowCursor(cursor))).toEqual(cursor);
  });

  it("returns null for garbage input instead of throwing", () => {
    expect(decodeFlowCursor("not-a-real-cursor")).toBeNull();
    expect(decodeFlowCursor("")).toBeNull();
    expect(decodeFlowCursor("!!!")).toBeNull();
  });

  it("returns null when the payload is valid JSON but missing slot", () => {
    const tampered = Buffer.from(JSON.stringify({ bucket: 1, score: 1, id: "x" }), "utf8").toString(
      "base64url",
    );
    expect(decodeFlowCursor(tampered)).toBeNull();
  });

  it("returns null when slot is not a finite number", () => {
    const tampered = Buffer.from(JSON.stringify({ slot: "thirty" }), "utf8").toString("base64url");
    expect(decodeFlowCursor(tampered)).toBeNull();
  });

  it("falls back non-string/number bucket, score, id fields to null rather than throwing", () => {
    const tampered = Buffer.from(
      JSON.stringify({ bucket: "one", score: "neg", id: 42, slot: 5 }),
      "utf8",
    ).toString("base64url");
    expect(decodeFlowCursor(tampered)).toEqual({ bucket: null, score: null, id: null, slot: 5 });
  });

  it("never produces the same string for different cursors", () => {
    const a = encodeFlowCursor({ bucket: 1, score: -1, id: "a", slot: 0 });
    const b = encodeFlowCursor({ bucket: 1, score: -1, id: "b", slot: 0 });
    expect(a).not.toBe(b);
  });
});

function fakeDb(rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>): Db {
  return { rpc } as unknown as Db;
}

describe("getFlowPage", () => {
  it("maps rows to items and builds nextCursor from the last row", async () => {
    const rows: FlowFeedRankRow[] = [
      {
        wave_id: "wave-1",
        bucket: 2,
        score: -10,
        cursor_bucket: 2,
        cursor_score: -10,
        cursor_id: "wave-1",
        cursor_slot: 1,
      },
      {
        wave_id: "wave-2",
        bucket: 4,
        score: 1.2,
        cursor_bucket: 4,
        cursor_score: 1.2,
        cursor_id: "wave-2",
        cursor_slot: 2,
      },
    ];
    const db = fakeDb(async () => ({ data: rows, error: null }));

    const page = await getFlowPage(db, { limit: 2, seed: 7 });

    expect(page.items).toEqual([
      { waveId: "wave-1", bucket: 2 },
      { waveId: "wave-2", bucket: 4 },
    ]);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeFlowCursor(page.nextCursor as string)).toEqual({
      bucket: 4,
      score: 1.2,
      id: "wave-2",
      slot: 2,
    });
  });

  it("returns a null cursor and no items on an empty page", async () => {
    const db = fakeDb(async () => ({ data: [], error: null }));
    const page = await getFlowPage(db);
    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it("decodes an incoming cursor into the RPC's p_cursor argument", async () => {
    let seenArgs: Record<string, unknown> | undefined;
    const db = fakeDb(async (_name, args) => {
      seenArgs = args;
      return { data: [], error: null };
    });

    const cursor = encodeFlowCursor({ bucket: 3, score: 5, id: "wave-9", slot: 20 });
    await getFlowPage(db, { cursor, seed: 3, limit: 5 });

    expect(seenArgs).toEqual({
      p_cursor: { bucket: 3, score: 5, id: "wave-9", slot: 20 },
      p_seed: 3,
      p_limit: 5,
    });
  });

  it("treats a malformed incoming cursor as a fresh page (p_cursor: null)", async () => {
    let seenArgs: Record<string, unknown> | undefined;
    const db = fakeDb(async (_name, args) => {
      seenArgs = args;
      return { data: [], error: null };
    });

    await getFlowPage(db, { cursor: "not-a-real-cursor" });

    expect(seenArgs?.p_cursor).toBeNull();
  });

  it("throws when the RPC reports an error", async () => {
    const db = fakeDb(async () => ({ data: null, error: { message: "boom", code: null, details: null, hint: null } }));
    await expect(getFlowPage(db)).rejects.toThrow();
  });
});

describe("recordFlowEvent", () => {
  it("calls record_flow_event with the given wave, kind and position", async () => {
    let seenName: string | undefined;
    let seenArgs: Record<string, unknown> | undefined;
    const db = fakeDb(async (name, args) => {
      seenName = name;
      seenArgs = args;
      return { data: null, error: null };
    });

    await recordFlowEvent(db, "wave-1", "skip", 1500);

    expect(seenName).toBe("record_flow_event");
    expect(seenArgs).toEqual({ p_wave_id: "wave-1", p_kind: "skip", p_position_ms: 1500 });
  });

  it("defaults p_position_ms to null when omitted", async () => {
    let seenArgs: Record<string, unknown> | undefined;
    const db = fakeDb(async (_name, args) => {
      seenArgs = args;
      return { data: null, error: null };
    });

    await recordFlowEvent(db, "wave-1", "impression");

    expect(seenArgs).toEqual({ p_wave_id: "wave-1", p_kind: "impression", p_position_ms: null });
  });

  it("throws when the RPC reports an error", async () => {
    const db = fakeDb(async () => ({ data: null, error: { message: "rate limited", code: "AKRTL", details: null, hint: null } }));
    await expect(recordFlowEvent(db, "wave-1", "impression")).rejects.toThrow();
  });
});

describe("countFlowNew", () => {
  it("returns the RPC's count", async () => {
    const db = fakeDb(async () => ({ data: 4, error: null }));
    expect(await countFlowNew(db)).toBe(4);
  });

  it("throws when the RPC reports an error", async () => {
    const db = fakeDb(async () => ({ data: null, error: { message: "boom", code: null, details: null, hint: null } }));
    await expect(countFlowNew(db)).rejects.toThrow();
  });
});
