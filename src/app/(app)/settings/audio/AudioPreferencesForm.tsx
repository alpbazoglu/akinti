"use client";

import { useSyncExternalStore } from "react";

import { Select, Switch, type SelectOption } from "@/components/ui";
import {
  getAudioPreferences,
  getServerAudioPreferences,
  setAudioPreferences,
  subscribeAudioPreferences,
  type AudioQualityPreference,
} from "@/lib/audio/preferences";

const QUALITY_OPTIONS: SelectOption[] = [
  { value: "auto", label: "Auto (best available)" },
  { value: "data_saver", label: "Data saver" },
];

/**
 * Settings → Audio (spec §25): autoplay-next and preferred quality, stored
 * per-device in `localStorage` (`src/lib/audio/preferences.ts`) — not
 * `profiles`, so this genuinely does not sync across devices.
 *
 * Reads through `useSyncExternalStore` rather than an effect + `useState`:
 * `localStorage` doesn't exist during SSR, and `getServerSnapshot` gives
 * React the same defaults for the very first client render as the server
 * produced, so there is no hydration mismatch and no synchronous `setState`
 * inside an effect body.
 */
export function AudioPreferencesForm() {
  const preferences = useSyncExternalStore(
    subscribeAudioPreferences,
    getAudioPreferences,
    getServerAudioPreferences,
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-surface p-5">
        <Switch
          label="Autoplay next Wave"
          description="When a Wave finishes, start the next one automatically where a queue exists (e.g. a feed)."
          checked={preferences.autoplayNext}
          onCheckedChange={(checked) => setAudioPreferences({ autoplayNext: checked })}
        />
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <Select
          id="audio-quality"
          label="Preferred quality"
          value={preferences.quality}
          onChange={(event) => setAudioPreferences({ quality: event.target.value as AudioQualityPreference })}
          options={QUALITY_OPTIONS}
          hint="Saved on this device only. AKINTI currently delivers one processed file per Wave — this preference is stored for when adaptive quality ships and doesn't change playback yet."
        />
      </section>

      <p className="text-xs text-fg-subtle">
        These preferences live on this device only — they are not stored on your account and will not
        follow you to another browser or phone.
      </p>
    </div>
  );
}
