import Link from "next/link";
import type { ReactNode } from "react";
import { AudioLines, Bookmark, ChevronRight, Handshake, MessageSquare } from "lucide-react";

import { PageHeader } from "@/components/layout";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";

export const metadata = { title: `Content · ${TERMS.settings}` };

interface ContentLink {
  readonly href: string;
  readonly label: string;
  readonly description: string;
  readonly icon: ReactNode;
}

const LINKS: readonly ContentLink[] = [
  {
    href: routes.settingsContentSaved(),
    label: "Saved",
    description: `${TERMS.waves} you've saved for later.`,
    icon: <Bookmark className="size-4" />,
  },
  {
    href: routes.settingsContentCommented(),
    label: "Commented",
    description: `${TERMS.waves} you've left a ${TERMS.comment.toLowerCase()} on.`,
    icon: <MessageSquare className="size-4" />,
  },
  {
    href: routes.settingsContentWaves(),
    label: TERMS.waves,
    description: `Every ${TERMS.wave.toLowerCase()} you've published.`,
    icon: <AudioLines className="size-4" />,
  },
  {
    href: routes.settingsContentDuets(),
    label: TERMS.duets,
    description: `Every ${TERMS.duet.toLowerCase()} you've published.`,
    icon: <Handshake className="size-4" />,
  },
];

/** Settings → Content (spec §25): Saved, Commented, Waves and Duets. */
export default async function ContentSettingsPage() {
  await requireUser(routes.settingsContent());

  return (
    <>
      <PageHeader title="Content" description="Your saved Waves, commented Waves, Waves and Duets." />
      <nav aria-label="Content" className="px-4 pb-6 sm:px-5">
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span aria-hidden="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-fg-muted">
                  {link.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-fg">{link.label}</span>
                  <span className="mt-0.5 block text-xs text-fg-subtle">{link.description}</span>
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
