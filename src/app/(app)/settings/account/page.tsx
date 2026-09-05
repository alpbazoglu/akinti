import { LogOut } from "lucide-react";
import { redirect } from "next/navigation";

import { signOut } from "@/app/(auth)/actions";
import { PageHeader } from "@/components/layout";
import { AccountForm } from "@/components/profile";
import { Button } from "@/components/ui";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { getProfileById } from "@/lib/db/profiles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { ChangePasswordForm } from "./ChangePasswordForm";

export const metadata = { title: `Account · ${TERMS.settings}` };

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

  return (
    <>
      <PageHeader title="Account" description="Your identity, password and session." />

      <div className="flex flex-col gap-6 px-4 pb-8 sm:px-5">
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-fg">Profile</h2>
          <p className="mt-1 mb-4 text-sm text-fg-muted">
            Your photo, display name, username and bio — visible on {`@${profile?.username ?? ""}`}.
          </p>
          <AccountForm
            initialUsername={profile?.username ?? ""}
            initialDisplayName={profile?.displayName ?? null}
            initialBio={profile?.bio ?? null}
            initialAvatarUrl={profile?.avatarUrl ?? null}
          />
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-fg">Email</h2>
          <p className="mt-1 text-sm text-fg-muted">{user.email ?? "—"}</p>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-fg">Password</h2>
          <p className="mt-1 mb-4 text-sm text-fg-muted">Choose a new password for your account.</p>
          <ChangePasswordForm />
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-fg">Session</h2>
          <p className="mt-1 mb-4 text-sm text-fg-muted">Sign out of {TERMS.brand} on this device.</p>
          <form action={handleSignOut}>
            <Button type="submit" variant="danger" leadingIcon={<LogOut className="size-4" />}>
              {TERMS.logOut}
            </Button>
          </form>
        </section>
      </div>
    </>
  );
}
