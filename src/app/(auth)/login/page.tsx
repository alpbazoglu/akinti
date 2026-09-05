import { EmptyState } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { LoginForm } from "./LoginForm";

export const metadata = { title: "Log in" };

interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

const CALLBACK_ERROR_MESSAGE = "That link has expired or was already used. Try signing in directly.";

export default async function LogInPage({ searchParams }: LoginPageProps) {
  const { next, error } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-display text-ink">Log in</h1>
      {isSupabaseConfigured() ? (
        <>
          <p className="type-body-sm measure text-ink-muted">Sign in with your email and password.</p>
          <LoginForm next={next} initialError={error === "callback_failed" ? CALLBACK_ERROR_MESSAGE : undefined} />
        </>
      ) : (
        <EmptyState
          size="sm"
          title="Backend not configured"
          description="NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. Signing in is unavailable until this environment is connected to a Supabase project."
        />
      )}
    </div>
  );
}
