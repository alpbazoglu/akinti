import { Settings } from "lucide-react";

import { TERMS } from "@/config/terminology";

import { PlaceholderPage } from "../../_components/PlaceholderPage";

export const metadata = { title: `Content · ${TERMS.settings}` };

export default function ContentSettingsPage() {
  return (
    <PlaceholderPage
      title="Content"
      description="Your saved Waves, commented Waves, Waves and Duets."
      icon={<Settings className="size-6" />}
      emptyTitle="Nothing saved yet"
      emptyDescription="Saved Waves collect here once saving is wired up."
    />
  );
}
