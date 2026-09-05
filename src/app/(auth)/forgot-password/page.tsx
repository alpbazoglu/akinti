import { EmptyState } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-display text-ink">Reset your password</h1>
      {isSupabaseConfigured() ? (
        <ForgotPasswordForm />
      ) : (
        <EmptyState
          size="sm"
          title="Backend not configured"
          description="NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. Password reset is unavailable until this environment is connected to a Supabase project."
        />
      )}
    </div>
  );
}
