"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Handshake } from "@/components/ui/icons";

import { Button, ErrorState, Textarea } from "@/components/ui";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";

import { requestDuet } from "@/app/(app)/w/[id]/duet/actions";

const MESSAGE_MAX_LENGTH = 500;

export interface DuetRequestFormProps {
  waveId: string;
  className?: string;
}

/**
 * The message field + submit for `/w/[id]/duet` (spec §15). Presentation and
 * a single Server Action call — `requestDuet`
 * (`src/app/(app)/w/[id]/duet/actions.ts`) owns every real check.
 */
export function DuetRequestForm({ waveId, className }: DuetRequestFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestDuet(waveId, message.trim() || null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(true);
      router.push(routes.duets());
    });
  };

  if (sent) {
    return (
      <p role="status" className="text-sm text-fg-muted">
        {TERMS.duetRequest} sent. Redirecting to your requests…
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={className} noValidate>
      <div className="flex flex-col gap-4">
        <Textarea
          id="duet-request-message"
          label="Add a message (optional)"
          placeholder="Say why you'd love to Duet on this…"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={MESSAGE_MAX_LENGTH}
          showCount
          disabled={isPending}
        />

        {error ? <ErrorState size="sm" title="Couldn't send this request" description={error} /> : null}

        <Button type="submit" size="lg" loading={isPending} leadingIcon={<Handshake className="size-4" />} fullWidth>
          {TERMS.requestDuet}
        </Button>
      </div>
    </form>
  );
}
