import { MessageCircle } from "lucide-react";

import { TERMS } from "@/config/terminology";

import { PlaceholderPage } from "../_components/PlaceholderPage";

export const metadata = { title: TERMS.messages };

/** Messages: conversations, audio messages and Duet communication (spec 22). */
export default function MessagesPage() {
  return (
    <PlaceholderPage
      title={TERMS.messages}
      description="Private conversations, audio messages and Duet coordination."
      icon={<MessageCircle className="size-6" />}
      emptyTitle="No conversations yet"
      emptyDescription="Audio messages are private. They are never Waves, and they never appear in a feed or in Explore."
    />
  );
}
