"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Handshake } from "@/components/ui/icons";

import { Button, ErrorState, Textarea } from "@/components/ui";
import { routes } from "@/config/routes";

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
  const t = useTranslations("DuetRequestForm");
  const tTerms = useTranslations("Terms");
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
        {t("sentRedirecting", { duetRequest: tTerms("duetRequest") })}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={className} noValidate>
      <div className="flex flex-col gap-4">
        <Textarea
          id="duet-request-message"
          label={t("addMessage")}
          placeholder={t("messagePlaceholder")}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={MESSAGE_MAX_LENGTH}
          showCount
          disabled={isPending}
        />

        {error ? <ErrorState size="sm" title={t("sendError")} description={error} /> : null}

        <Button type="submit" size="lg" loading={isPending} leadingIcon={<Handshake className="size-4" />} fullWidth>
          {tTerms("requestDuet")}
        </Button>
      </div>
    </form>
  );
}
