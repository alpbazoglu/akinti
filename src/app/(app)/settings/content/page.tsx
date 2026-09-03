import { Settings } from "lucide-react";

import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";

import { PlaceholderPage } from "../../_components/PlaceholderPage";

export const metadata = { title: `Content · ${TERMS.settings}` };

export default async function ContentSettingsPage() {
  await requireUser(routes.settingsContent());

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
