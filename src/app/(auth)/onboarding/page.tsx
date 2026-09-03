import { EmptyState } from "@/components/ui";

export const metadata = { title: "Get started" };

export default function OnboardingPage() {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <h1 className="border-b border-border px-5 py-4 text-base font-semibold text-fg">Get started</h1>
      <p className="px-5 pt-4 text-sm text-fg-muted">Pick a username, choose a few interests, and publish your first Wave.</p>
      <EmptyState size="sm" title="Onboarding is not wired up yet" description="Every onboarding step is skippable by design, and none of them gate browsing." />
    </div>
  );
}
