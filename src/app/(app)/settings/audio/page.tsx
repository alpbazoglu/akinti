import { PageHeader } from "@/components/layout";
import { TERMS } from "@/config/terminology";
import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";

import { AudioPreferencesForm } from "./AudioPreferencesForm";

export const metadata = { title: `Audio · ${TERMS.settings}` };

/**
 * Settings → Audio (spec §25). Per-device only (`localStorage`, see
 * `src/lib/audio/preferences.ts`) — there is no `profiles` column for these,
 * deliberately: they aren't safety/notification-shaped settings that need to
 * sync across devices.
 */
export default async function AudioSettingsPage() {
  await requireUser(routes.settingsAudio());

  return (
    <>
      <PageHeader title="Audio" />
      <div className="flex flex-col gap-6 px-4 pb-8 sm:px-5">
        <AudioPreferencesForm />
      </div>
    </>
  );
}
