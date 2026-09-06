"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { BRAND } from "@/config/terminology";
import { Select, Switch, type SelectOption } from "@/components/ui";
import {
  getAudioPreferences,
  getServerAudioPreferences,
  setAudioPreferences,
  subscribeAudioPreferences,
  type AudioQualityPreference,
} from "@/lib/audio/preferences";

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
  const t = useTranslations("AudioPreferencesForm");

  const qualityOptions: SelectOption[] = [
    { value: "auto", label: t("qualityAuto") },
    { value: "data_saver", label: t("qualityDataSaver") },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="border-t border-hairline pt-5">
        <Switch
          label={t("autoplayLabel")}
          description={t("autoplayDescription")}
          checked={preferences.autoplayNext}
          onCheckedChange={(checked) => setAudioPreferences({ autoplayNext: checked })}
        />
      </section>

      <section className="flex flex-col gap-4 border-t border-hairline pt-5">
        <Select
          id="audio-quality"
          label={t("qualityLabel")}
          value={preferences.quality}
          onChange={(event) => setAudioPreferences({ quality: event.target.value as AudioQualityPreference })}
          options={qualityOptions}
          hint={t("qualityHint", { brand: BRAND })}
        />
      </section>

      <p className="text-xs text-fg-subtle">
        {t("deviceOnlyNote")}
      </p>
    </div>
  );
}
