import { Settings } from "lucide-react";

import { TERMS } from "@/config/terminology";

import { PlaceholderPage } from "../../_components/PlaceholderPage";

export const metadata = { title: `Account · ${TERMS.settings}` };

export default function AccountSettingsPage() {
  return (
    <PlaceholderPage
      title="Account"
      description="Edit your profile, username, email, password and account deletion."
      icon={<Settings className="size-6" />}
      emptyTitle="Account settings are not wired up yet"
      emptyDescription="Editing your profile arrives with the profile stage."
    />
  );
}
