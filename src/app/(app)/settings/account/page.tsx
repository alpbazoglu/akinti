import { LogOut } from "@/components/ui/icons";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { signOut } from "@/app/(auth)/actions";
import { PageHeader } from "@/components/layout";
import { AccountForm } from "@/components/profile";
import { Button } from "@/components/ui";
import { routes } from "@/config/routes";
import { BRAND } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { getProfileById } from "@/lib/db/profiles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { ChangePasswordForm } from "./ChangePasswordForm";

export async function generateMetadata() {
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("AccountSettingsPage");
  return { title: tPage("metaTitle", { settings: t("settings") }) };
}

/**
 * Adapts `signOut`'s `AuthActionResult` return to the `void` a plain
 * `<form action>` expects, and — unlike `UserMenu`'s direct call — is safe to
 * `redirect()` from: this function *is* the form's action, so Next.js's
 * built-in form-action/RedirectBoundary wiring handles the navigation
 * reliably (see the doc comment on `signOut` for why a direct, un-awaited
 * call from an event handler is not).
 */
async function handleSignOut(): Promise<void> {
  "use server";
  const result = await signOut();
  if (result.ok) {
    redirect(result.redirectTo ?? routes.login());
  }
}

/** Account settings (spec §25): avatar, display name, username, bio, email, password, sign out. */
export default async function AccountSettingsPage() {
  const user = await requireUser("/settings/account");
  const supabase = await createServerSupabaseClient();
  const profile = await getProfileById(supabase, user.id);
  const t = await getTranslations("AccountSettingsPage");
  const tTerms = await getTranslations("Terms");

  return (
    <>
      <PageHeader title={t("title")} />

      {/* Rail-hung plain form: no card boundary, hairline separators between
          groups (DESIGN.md §12 rule 1 — "never wrap content in a card"). */}
      <div className="flex flex-col divide-y divide-border px-4 pb-8 sm:px-5">
        <section className="py-6 first:pt-0">
          <h2 className="text-sm font-semibold text-fg">{t("profileHeading")}</h2>
          <p className="mt-1 mb-4 text-sm text-fg-muted">
            {t("profileDescription", { username: profile?.username ?? "" })}
          </p>
          <AccountForm
            initialUsername={profile?.username ?? ""}
            initialDisplayName={profile?.displayName ?? null}
            initialBio={profile?.bio ?? null}
            initialAvatarUrl={profile?.avatarUrl ?? null}
          />
        </section>

        <section className="py-6">
          <h2 className="text-sm font-semibold text-fg">{t("emailHeading")}</h2>
          <p className="mt-1 text-sm text-fg-muted">{user.email ?? "—"}</p>
        </section>

        <section className="py-6">
          <h2 className="text-sm font-semibold text-fg">{t("passwordHeading")}</h2>
          <p className="mt-1 mb-4 text-sm text-fg-muted">{t("passwordDescription")}</p>
          <ChangePasswordForm />
        </section>

        <section className="py-6 last:pb-0">
          <h2 className="text-sm font-semibold text-fg">{t("sessionHeading")}</h2>
          <p className="mt-1 mb-4 text-sm text-fg-muted">{t("signOutDescription", { brand: BRAND })}</p>
          <form action={handleSignOut}>
            <Button type="submit" variant="danger" leadingIcon={<LogOut className="size-4" />}>
              {tTerms("logOut")}
            </Button>
          </form>
        </section>
      </div>
    </>
  );
}
