import { describe, expect, it } from "vitest";

import { flagSuspiciousPlayEvents, SUSPICIOUS_PLAY_THRESHOLD } from "./suspiciousPlay";

function eventsFor(waveId: string, listenerKey: string, count: number, day = "2026-09-04") {
  return Array.from({ length: count }, (_, i) => ({
    waveId,
    listenerKey,
    createdAt: `${day}T${String(i % 24).padStart(2, "0")}:00:00.000Z`,
  }));
}

describe("flagSuspiciousPlayEvents", () => {
  it("mirrors SUSPICIOUS_PLAY_THRESHOLD = 20 (the SQL 'having count(*) > 20')", () => {
    expect(SUSPICIOUS_PLAY_THRESHOLD).toBe(20);
  });

  it("does not flag a group at or below the threshold", () => {
    const flagged = flagSuspiciousPlayEvents(eventsFor("wave-1", "s:abc", 20));
    expect(flagged.every((e) => !e.suspicious)).toBe(true);
  });

  it("flags every event in a group that exceeds the threshold", () => {
    const flagged = flagSuspiciousPlayEvents(eventsFor("wave-1", "s:abc", 21));
    expect(flagged).toHaveLength(21);
    expect(flagged.every((e) => e.suspicious)).toBe(true);
  });

  it("does not flag the whole group's earlier events differently — all 21 are flagged, not just #21", () => {
    const flagged = flagSuspiciousPlayEvents(eventsFor("wave-1", "s:abc", 25));
    expect(flagged.filter((e) => e.suspicious)).toHaveLength(25);
  });

  it("scopes the count per (wave, listener, day) — a different wave resets the count", () => {
    const events = [...eventsFor("wave-1", "s:abc", 21), ...eventsFor("wave-2", "s:abc", 5)];
    const flagged = flagSuspiciousPlayEvents(events);
    expect(flagged.filter((e) => e.waveId === "wave-1").every((e) => e.suspicious)).toBe(true);
    expect(flagged.filter((e) => e.waveId === "wave-2").every((e) => !e.suspicious)).toBe(true);
  });

  it("scopes the count per listener — a different listener_key on the same Wave resets the count", () => {
    const events = [...eventsFor("wave-1", "s:abc", 21), ...eventsFor("wave-1", "s:xyz", 5)];
    const flagged = flagSuspiciousPlayEvents(events);
    expect(flagged.filter((e) => e.listenerKey === "s:abc").every((e) => e.suspicious)).toBe(true);
    expect(flagged.filter((e) => e.listenerKey === "s:xyz").every((e) => !e.suspicious)).toBe(true);
  });

  it("scopes the count per calendar day — spreading the same volume across two days stays under threshold", () => {
    const events = [
      ...eventsFor("wave-1", "s:abc", 15, "2026-09-04"),
      ...eventsFor("wave-1", "s:abc", 15, "2026-09-05"),
    ];
    const flagged = flagSuspiciousPlayEvents(events);
    expect(flagged.every((e) => !e.suspicious)).toBe(true);
  });

  it("returns an empty array for no input", () => {
    expect(flagSuspiciousPlayEvents([])).toEqual([]);
  });
});
