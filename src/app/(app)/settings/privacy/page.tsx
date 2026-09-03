import { Settings } from "lucide-react";

import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";

import { PlaceholderPage } from "../../_components/PlaceholderPage";

export const metadata = { title: `Privacy · ${TERMS.settings}` };

export default async function PrivacySettingsPage() {
  await requireUser(routes.settingsPrivacy());

  return (
    <PlaceholderPage
      title="Privacy"
      description="Profile visibility, who can message you, who can send Duet Requests, default Wave visibility."
      icon={<Settings className="size-6" />}
      emptyTitle="Privacy settings are not wired up yet"
      emptyDescription="Every one of these is enforced server-side, never only in the interface."
    />
  );
}
