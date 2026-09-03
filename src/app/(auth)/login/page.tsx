import { EmptyState } from "@/components/ui";

export const metadata = { title: "Log in" };

export default function LogInPage() {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <h1 className="border-b border-border px-5 py-4 text-base font-semibold text-fg">Log in</h1>
      <p className="px-5 pt-4 text-sm text-fg-muted">Sign in with your email and password.</p>
      <EmptyState size="sm" title="The sign-in form is not wired up yet" description="Authentication arrives in the next stage. Browsing is never gated behind it." />
    </div>
  );
}
