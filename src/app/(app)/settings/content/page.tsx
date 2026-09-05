import Link from "next/link";
import { ChevronRight } from "@/components/ui/icons";

import { PageHeader } from "@/components/layout";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";

export const metadata = { title: `Content · ${TERMS.settings}` };

interface ContentLink {
  readonly href: string;
  readonly label: string;
  readonly description: string;
}

const LINKS: readonly ContentLink[] = [
  {
    href: routes.settingsContentSaved(),
    label: "Saved",
    description: `${TERMS.waves} you've saved for later.`,
  },
  {
    href: routes.settingsContentCommented(),
    label: "Commented",
    description: `${TERMS.waves} you've left a ${TERMS.comment.toLowerCase()} on.`,
  },
  {
    href: routes.settingsContentWaves(),
    label: TERMS.waves,
    description: `Every ${TERMS.wave.toLowerCase()} you've published.`,
  },
  {
    href: routes.settingsContentDuets(),
    label: TERMS.duets,
    description: `Every ${TERMS.duet.toLowerCase()} you've published.`,
  },
];

/** Settings → Content (spec §25): Saved, Commented, Waves and Duets. */
export default async function ContentSettingsPage() {
  await requireUser(routes.settingsContent());

  return (
    <>
      <PageHeader title="Content" />
      <nav aria-label="Content" className="px-4 pb-6 sm:px-5">
        <ul className="divide-y divide-hairline border-y border-hairline">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="flex min-h-14 items-center gap-4 px-1 py-3 transition-colors hover:bg-paper-sunk focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
              >
                <span className="min-w-0 flex-1">
                  <span className="type-subhead block text-ink">{link.label}</span>
                  <span className="type-caption measure mt-1 block text-ink-subtle">{link.description}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
