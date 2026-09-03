import { Settings } from "lucide-react";

import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";

import { PlaceholderPage } from "../../_components/PlaceholderPage";

export const metadata = { title: `Safety · ${TERMS.settings}` };

export default async function SafetySettingsPage() {
  await requireUser(routes.settingsSafety());

  return (
    <PlaceholderPage
      title="Safety"
      description="Blocked users, reports and security."
      icon={<Settings className="size-6" />}
      emptyTitle="Nothing to review"
      emptyDescription="Blocking and reporting arrive with the safety stage."
    />
  );
}
