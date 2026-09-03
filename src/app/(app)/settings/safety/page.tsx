import { Settings } from "lucide-react";

import { TERMS } from "@/config/terminology";

import { PlaceholderPage } from "../../_components/PlaceholderPage";

export const metadata = { title: `Safety · ${TERMS.settings}` };

export default function SafetySettingsPage() {
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
