/**
 * Share channel helpers (spec §14): "internal messages, copy/share link,
 * platform-native share sheet where available". `SHARE_CHANNELS`
 * (`src/types/domain.ts`) is the single source of truth for the enum itself
 * — this module only adds the pure, unit-testable pieces around it: parsing
 * an arbitrary string into a channel, and building the URL every channel
 * shares.
 *
 * The URL is deliberately just `origin + routes.wave(waveId)` — never the
 * audio asset's signed URL. A shared link must still be resolved through
 * `can_view_wave()`/RLS on every open (spec §14: sharing a Wave must never
 * widen its visibility), which only happens by sending people to the Wave
 * page, not a direct media link.
 */

import { routes } from "@/config/routes";
import { SHARE_CHANNELS, type ShareChannel } from "@/types/domain";

export { SHARE_CHANNELS };
export type { ShareChannel };

export function isShareChannel(value: string): value is ShareChannel {
  return (SHARE_CHANNELS as readonly string[]).includes(value);
}

export function parseShareChannel(value: string): ShareChannel | null {
  return isShareChannel(value) ? value : null;
}

/** The link every share channel points to. `origin` has no trailing slash (e.g. `window.location.origin`). */
export function buildWaveShareUrl(origin: string, waveId: string): string {
  return `${origin.replace(/\/+$/, "")}${routes.wave(waveId)}`;
}
