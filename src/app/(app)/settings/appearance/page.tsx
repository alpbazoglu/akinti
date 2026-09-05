import { PageHeader } from "@/components/layout";
import { AppearanceForm } from "@/components/profile";
import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { getProfileById } from "@/lib/db/profiles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata = { title: `Appearance · ${TERMS.settings}` };

/** Settings → Appearance (spec §21/§25): curated profile theme presets. */
export default async function AppearanceSettingsPage() {
  const user = await requireUser(routes.settingsAppearance());

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title="Appearance" />
        <EmptyState title="Backend not configured" description="Appearance settings are unavailable in this environment." />
      </>
    );
  }

  const supabase = await createServerSupabaseClient();
  const profile = await getProfileById(supabase, user.id);

  if (!profile) {
    return (
      <>
        <PageHeader title="Appearance" />
        <EmptyState title="Could not load your profile" description="Try refreshing the page." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Appearance"
      />
      <div className="px-4 pb-8 sm:px-5">
        <AppearanceForm
          initialBgColor={profile.theme.backgroundColor}
          initialBgGradient={profile.theme.backgroundGradient}
          initialBgPattern={profile.theme.backgroundPattern}
          initialAccent={profile.theme.accent}
          name={profile.displayName ?? profile.username}
          avatarUrl={profile.avatarUrl}
        />
      </div>
    </>
  );
}
