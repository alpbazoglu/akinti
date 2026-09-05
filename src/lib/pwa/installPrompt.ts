"use client";

/**
 * Install-prompt store (`docs/PRODUCT_V2.md` §4: "install prompt after
 * first publish"). A plain module-level store rather than React Context —
 * `beforeinstallprompt` fires at most once per page load, long before any
 * component that cares about it necessarily mounts, so the listener has to
 * live outside the component tree; `useSyncExternalStore` is what lets React
 * read it safely regardless of mount order.
 *
 * iOS never fires `beforeinstallprompt` at all
 * (`docs/research/mobile-guidelines.md`: "No native install prompt exists on
 * iOS ... design an explicit in-app instruction card") — `canInstall` stays
 * `false` there, and `InstallHint` (`src/components/pwa/InstallHint.tsx`)
 * degrades to a Share-sheet instruction instead of a real prompt.
 *
 * `markFirstPublish()` is the one export the create flow needs
 * (`src/app/(app)/create/CreateFlow.tsx`, owned by another agent — see this
 * stage's report for the exact one-line call to add after a successful
 * publish).
 */

import { useSyncExternalStore } from "react";

const FIRST_PUBLISH_KEY = "akinti.pwa.firstPublish";
const DISMISSED_KEY = "akinti.pwa.installHintDismissed";

/** Not yet in `lib.dom.d.ts` — Chromium-only, still a draft. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt: () => Promise<void>;
}

export interface InstallPromptState {
  /** A real `beforeinstallprompt` is available to trigger right now. */
  readonly canInstall: boolean;
  /** `markFirstPublish()` has fired at least once on this device. */
  readonly hasPublished: boolean;
  /** The rail hint has already been dismissed on this device. */
  readonly dismissed: boolean;
  /** `appinstalled` has fired — the app is already on the home screen. */
  readonly installed: boolean;
}

const isBrowser = typeof window !== "undefined";

function readFlag(key: string): boolean {
  if (!isBrowser) return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    // Private browsing / storage blocked — behave as if the flag were unset
    // rather than throwing.
    return false;
  }
}

function writeFlag(key: string): void {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Best-effort only; a failed write just means the hint may reappear.
  }
}

let deferredEvent: BeforeInstallPromptEvent | null = null;
let installed = false;

let state: InstallPromptState = {
  canInstall: false,
  hasPublished: readFlag(FIRST_PUBLISH_KEY),
  dismissed: readFlag(DISMISSED_KEY),
  installed: false,
};

const listeners = new Set<() => void>();

function recompute(): void {
  const next: InstallPromptState = {
    canInstall: deferredEvent !== null,
    hasPublished: readFlag(FIRST_PUBLISH_KEY),
    dismissed: readFlag(DISMISSED_KEY),
    installed,
  };
  const unchanged =
    next.canInstall === state.canInstall &&
    next.hasPublished === state.hasPublished &&
    next.dismissed === state.dismissed &&
    next.installed === state.installed;
  if (unchanged) return;
  state = next;
  listeners.forEach((listener) => listener());
}

if (isBrowser) {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredEvent = event as BeforeInstallPromptEvent;
    recompute();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredEvent = null;
    recompute();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): InstallPromptState {
  return state;
}

function getServerSnapshot(): InstallPromptState {
  return { canInstall: false, hasPublished: false, dismissed: false, installed: false };
}

/** Read the current install-prompt state, re-rendering on any change. */
export function useInstallPromptState(): InstallPromptState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Mark that the current user has published their own first Wave. Call this
 * once, right after a publish succeeds — it is idempotent and cheap to call
 * more than once.
 */
export function markFirstPublish(): void {
  writeFlag(FIRST_PUBLISH_KEY);
  recompute();
}

/** Dismiss the rail hint. Persists across sessions on this device. */
export function dismissInstallHint(): void {
  writeFlag(DISMISSED_KEY);
  recompute();
}

/**
 * Trigger the real browser install prompt. Resolves `"unavailable"` when
 * there is no captured `beforeinstallprompt` (already installed, iOS, or the
 * browser hasn't offered one yet) — callers should already be gating on
 * `canInstall` before showing anything that calls this.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredEvent) return "unavailable";
  const event = deferredEvent;
  await event.prompt();
  const choice = await event.userChoice;
  deferredEvent = null;
  recompute();
  return choice.outcome;
}
