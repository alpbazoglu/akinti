import { LogOut } from "lucide-react";

import { signOut } from "@/app/(auth)/actions";
import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { getProfileById } from "@/lib/db/profiles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { ChangePasswordForm } from "./ChangePasswordForm";

export const metadata = { title: `Account · ${TERMS.settings}` };

/** Adapts `signOut`'s `AuthActionResult` return to the `void` a plain `<form action>` expects. */
async function handleSignOut(): Promise<void> {
  "use server";
  await signOut();
}

/**
 * Account settings (spec §25). Profile customization (avatar, bio, theme)
 * arrives with the Profiles stage — this page owns what Stage 2 actually
 * delivers: account identity, password, and signing out.
 */
export default async function AccountSettingsPage() {
  const user = await requireUser("/settings/account");
  const supabase = await createServerSupabaseClient();
  const profile = await getProfileById(supabase, user.id);

  return (
    <>
      <PageHeader title="Account" description="Your identity, password and session." />

      <div className="flex flex-col gap-6 px-4 pb-8 sm:px-5">
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-fg">Identity</h2>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-fg-muted">Username</dt>
              <dd className="font-medium text-fg">@{profile?.username ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-fg-muted">Email</dt>
              <dd className="font-medium text-fg">{user.email ?? "—"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-fg-subtle">
            Editing your username, display name, bio and avatar arrives with the Profiles stage.
          </p>
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
