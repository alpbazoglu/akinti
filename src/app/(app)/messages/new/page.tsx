import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";
import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";

import { startConversation } from "../actions";

const PRIMARY_LINK = "text-sm font-medium text-accent underline underline-offset-2";
const SECONDARY_LINK =
  "inline-flex h-9 items-center justify-center rounded-full border border-border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-muted";

export async function generateMetadata() {
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("NewConversationPage");
  return { title: tPage("metaTitle", { messages: t("messages") }) };
}

interface NewConversationPageProps {
  searchParams: Promise<{ to?: string }>;
}

/**
 * `/messages/new?to=<username>` (spec §22 deliverable 2): resolves or
 * creates the 1:1 conversation with `to`, respecting `message_permission`
 * (everyone / followers / people I follow / nobody) via `startConversation`,
 * then redirects to `/messages/[id]`. A permission denial or an unknown
 * username renders a clear "can't message" state instead of a broken thread.
 */
export default async function NewConversationPage({ searchParams }: NewConversationPageProps) {
  const { to } = await searchParams;
  await requireUser(to ? routes.messageNew(to) : routes.messages());
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("NewConversationPage");

  if (!to) {
    return (
      <>
        <PageHeader title={tPage("title")} />
        <EmptyState
          title={tPage("noOneTitle")}
          description={tPage("noOneDescription")}
          action={
            <Link href={routes.messages()} className={PRIMARY_LINK}>
              {tPage("backTo", { messages: t("messages") })}
            </Link>
          }
        />
      </>
    );
  }

  const result = await startConversation(to);

  if (result.ok && result.data) {
    redirect(routes.conversation(result.data.conversationId));
  }

  return (
    <>
      <PageHeader title={tPage("title")} />
      <EmptyState
        title={tPage("cantStartTitle")}
        description={result.error ?? tPage("cantStartDefault")}
        action={
          <Link href={routes.profile(to)} className={SECONDARY_LINK}>
            {tPage("viewProfile")}
          </Link>
        }
        secondaryAction={
          <Link href={routes.messages()} className={PRIMARY_LINK}>
            {tPage("backTo", { messages: t("messages") })}
          </Link>
        }
      />
    </>
  );
}
