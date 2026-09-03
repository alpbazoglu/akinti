import { Settings } from "lucide-react";

import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";

import { PlaceholderPage } from "../../_components/PlaceholderPage";

export const metadata = { title: `Audio · ${TERMS.settings}` };

export default async function AudioSettingsPage() {
  await requireUser(routes.settingsAudio());

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
