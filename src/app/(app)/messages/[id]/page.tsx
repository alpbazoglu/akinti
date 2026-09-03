import { MessageCircle } from "lucide-react";

import { TERMS } from "@/config/terminology";

import { PlaceholderPage } from "../../_components/PlaceholderPage";

interface ConversationPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ConversationPageProps) {
  const { id } = await params;
  return { title: `${TERMS.messages} · ${id}` };
}

/** A single conversation thread. */
export default async function ConversationPage({ params }: ConversationPageProps) {
  const { id } = await params;

  return (
    <PlaceholderPage
      title="Conversation"
      description={`Thread ${id}`}
      icon={<MessageCircle className="size-6" />}
      emptyTitle="No messages in this conversation"
      emptyDescription="Messaging arrives in a later stage. Blocked users will not be able to reach each other in either direction."
    />
  );
}
