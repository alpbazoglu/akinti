import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout";
import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";

import { AudioPreferencesForm } from "./AudioPreferencesForm";

export async function generateMetadata() {
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("AudioSettingsPage");
  return { title: tPage("metaTitle", { settings: t("settings") }) };
}

/**
 * Settings → Audio (spec §25). Per-device only (`localStorage`, see
 * `src/lib/audio/preferences.ts`) — there is no `profiles` column for these,
 * deliberately: they aren't safety/notification-shaped settings that need to
 * sync across devices.
 */
export default async function AudioSettingsPage() {
  await requireUser(routes.settingsAudio());
  const t = await getTranslations("AudioSettingsPage");

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="flex flex-col gap-6 px-4 pb-8 sm:px-5">
        <AudioPreferencesForm />
      </div>
    </>
  );
}
