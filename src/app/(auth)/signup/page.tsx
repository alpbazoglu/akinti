import { EmptyState } from "@/components/ui";

export const metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <h1 className="border-b border-border px-5 py-4 text-base font-semibold text-fg">Sign up</h1>
      <p className="px-5 pt-4 text-sm text-fg-muted">Create an account and claim your username.</p>
      <EmptyState size="sm" title="The sign-up form is not wired up yet" description="Authentication arrives in the next stage." />
    </div>
  );
}
