import Link from "next/link";
import { redirect } from "next/navigation";

import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";

import { startConversation } from "../actions";

const PRIMARY_LINK = "text-sm font-medium text-accent underline underline-offset-2";
const SECONDARY_LINK =
  "inline-flex h-9 items-center justify-center rounded-full border border-border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-muted";

export const metadata = { title: `New message · ${TERMS.messages}` };

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

  if (!to) {
    return (
      <>
        <PageHeader title="New message" />
        <EmptyState
          title="No one to message"
          description="Open a profile and choose Message to start a conversation."
          action={
            <Link href={routes.messages()} className={PRIMARY_LINK}>
              Back to {TERMS.messages}
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
      <PageHeader title="New message" />
      <EmptyState
        title="Can't start this conversation"
        description={result.error ?? "This account can't be messaged right now."}
        action={
          <Link href={routes.profile(to)} className={SECONDARY_LINK}>
            View profile
          </Link>
        }
        secondaryAction={
          <Link href={routes.messages()} className={PRIMARY_LINK}>
            Back to {TERMS.messages}
          </Link>
        }
      />
    </>
  );
}
