import Link from "next/link";
import { ChevronRight } from "@/components/ui/icons";

import { PageHeader } from "@/components/layout";
import { SETTINGS_SECTIONS, routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";

export const metadata = { title: TERMS.settings };

/** Settings index (spec 25). */
export default async function SettingsPage() {
  await requireUser(routes.settings());

  return (
    <>
      <PageHeader title={TERMS.settings} />
      <nav aria-label={TERMS.settings} className="px-4 pb-6 sm:px-5">
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {SETTINGS_SECTIONS.map((section) => (
            <li key={section.key}>
              <Link
                href={section.href}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-fg">{section.label}</span>
                  <span className="mt-0.5 block text-xs text-fg-subtle">{section.description}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
