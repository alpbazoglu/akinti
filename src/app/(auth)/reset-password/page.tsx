import Link from "next/link";

import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { getCurrentUser } from "@/lib/auth/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata = { title: "Set a new password" };

export default async function ResetPasswordPage() {
  const configured = isSupabaseConfigured();
  const user = configured ? await getCurrentUser() : null;

  return (
    <div className="rounded-xl border border-border bg-surface">
      <h1 className="border-b border-border px-5 py-4 text-base font-semibold text-fg">Set a new password</h1>
      {!configured ? (
        <EmptyState
          size="sm"
          title="Backend not configured"
          description="NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. Password reset is unavailable until this environment is connected to a Supabase project."
        />
      ) : user ? (
        <ResetPasswordForm />
      ) : (
        <EmptyState
          size="sm"
          title="This link has expired"
          description="Password reset links only work once and expire after a while. Request a new one and try again."
          action={
            <Link
              href={routes.forgotPassword()}
              className="text-sm font-medium text-accent underline underline-offset-2"
            >
              Request a new link
            </Link>
          }
        />
      )}
    </div>
  );
}
