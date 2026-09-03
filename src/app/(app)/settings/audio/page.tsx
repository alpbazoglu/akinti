import { Settings } from "lucide-react";

import { TERMS } from "@/config/terminology";

import { PlaceholderPage } from "../../_components/PlaceholderPage";

export const metadata = { title: `Audio · ${TERMS.settings}` };

export default function AudioSettingsPage() {
  return (
    <PlaceholderPage
      title="Audio"
      description="Playback preferences, autoplay and audio quality."
      icon={<Settings className="size-6" />}
      emptyTitle="Audio settings are not wired up yet"
      emptyDescription="Playback preferences arrive with the audio infrastructure stage."
    />
  );
}
