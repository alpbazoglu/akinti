import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRight } from "@/components/ui/icons";

import { PageHeader } from "@/components/layout";
import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";

export async function generateMetadata() {
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("ContentSettingsPage");
  return { title: tPage("metaTitle", { settings: t("settings") }) };
}

interface ContentLink {
  readonly href: string;
  readonly label: string;
  readonly description: string;
}

/** Settings → Content (spec §25): Saved, Commented, Waves and Duets. */
export default async function ContentSettingsPage() {
  await requireUser(routes.settingsContent());
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("ContentSettingsPage");

  const links: readonly ContentLink[] = [
    {
      href: routes.settingsContentSaved(),
      label: tPage("savedLabel"),
      description: tPage("savedDescription", { waves: t("waves") }),
    },
    {
      href: routes.settingsContentCommented(),
      label: tPage("commentedLabel"),
      description: tPage("commentedDescription", { waves: t("waves"), comment: t("comment") }),
    },
    {
      href: routes.settingsContentWaves(),
      label: t("waves"),
      description: tPage("wavesDescription", { wave: t("wave") }),
    },
    {
      href: routes.settingsContentDuets(),
      label: t("duets"),
      description: tPage("duetsDescription", { duet: t("duet") }),
    },
  ];

  return (
    <>
      <PageHeader title={tPage("title")} />
      <nav aria-label={tPage("navLabel")} className="px-4 pb-6 sm:px-5">
        <ul className="divide-y divide-hairline border-y border-hairline">
          {links.map((link) => (
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
