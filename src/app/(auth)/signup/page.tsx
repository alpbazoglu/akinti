import { EmptyState } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { SignUpForm } from "./SignUpForm";

export const metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-display text-ink">Sign up</h1>
      {isSupabaseConfigured() ? (
        <>
          <p className="type-body-sm measure text-ink-muted">Create an account and claim your username.</p>
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
