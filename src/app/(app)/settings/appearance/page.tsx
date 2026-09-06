import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";

import { PageHeader } from "@/components/layout";
import { AppearanceForm } from "@/components/profile";
import { AppearancePreview } from "@/components/settings";
import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";
import { getProfileById } from "@/lib/db/profiles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveThemeMode, THEME_COOKIE } from "@/lib/ui/themeMode";

export async function generateMetadata() {
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("AppearanceSettingsPage");
  return { title: tPage("metaTitle", { settings: t("settings") }) };
}

/** Settings → Appearance (spec §21/§25): curated profile theme presets. */
export default async function AppearanceSettingsPage() {
  const user = await requireUser(routes.settingsAppearance());
  const t = await getTranslations("AppearanceSettingsPage");

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState title={t("backendNotConfiguredTitle")} description={t("backendNotConfiguredDescription")} />
      </>
    );
  }

  const supabase = await createServerSupabaseClient();
  const profile = await getProfileById(supabase, user.id);

  if (!profile) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState title={t("couldNotLoadTitle")} description={t("couldNotLoadDescription")} />
      </>
    );
  }

  const cookieStore = await cookies();
  const initialThemeMode = resolveThemeMode(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <>
      <PageHeader
        title={t("title")}
      />
      <div className="akinti-page flex flex-col gap-8 pb-8 lg:flex-row lg:items-start lg:gap-10">
        <div className="min-w-0 lg:flex-1">
          <AppearanceForm
            initialThemeMode={initialThemeMode}
            initialSignatureHue={profile.signatureHue}
          />
        </div>
        {/* Desktop-only live preview (`DESIGN_V3_DESKTOP.md`): a mock Wave
            row using the signature hue, updated live via `useCurrentUser()`
            the moment `AppearanceForm` saves — see `AppearancePreview`. */}
        <div className="hidden lg:block lg:w-72 lg:shrink-0">
          <AppearancePreview initialSignatureHue={profile.signatureHue} />
        </div>
      </div>
    </>
  );
}
