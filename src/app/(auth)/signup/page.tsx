import { EmptyState } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { SignUpForm } from "./SignUpForm";

export const metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <h1 className="border-b border-border px-5 py-4 text-base font-semibold text-fg">Sign up</h1>
      {isSupabaseConfigured() ? (
        <>
          <p className="px-5 pt-4 text-sm text-fg-muted">Create an account and claim your username.</p>
          <SignUpForm />
        </>
      ) : (
        <EmptyState
          size="sm"
          title="Backend not configured"
          description="NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. Creating an account is unavailable until this environment is connected to a Supabase project."
        />
      )}
    </div>
  );
}
