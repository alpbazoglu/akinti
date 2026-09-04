"use client";

import { useState, useTransition } from "react";

import { updateNotificationPreferences } from "@/app/(app)/settings/actions";
import { Switch, useToast } from "@/components/ui";
import { NOTIFICATION_CATEGORIES, type NotificationCategory, type NotificationPreferences } from "@/types/domain";

export interface NotificationsFormProps {
  initialPreferences: NotificationPreferences;
}

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  message: "Messages",
  duet: "Duets",
  comment: "Comments",
  follower: "Followers",
  system: "AKINTI updates",
};

const CATEGORY_DESCRIPTIONS: Record<NotificationCategory, string> = {
  message: "New messages sent to you.",
  duet: "Duet Requests, accepted/declined Duets, Duets published from your Waves, and collaborator invites.",
  comment: "Comments on your Waves and replies to your comments.",
  follower: "New followers and follow requests.",
  system: "Account and moderation notices from AKINTI, e.g. a warning on a report.",
};

/** Settings → Notifications (spec §23, §25): one toggle per category, saved as soon as it changes. */
export function NotificationsForm({ initialPreferences }: NotificationsFormProps) {
  const { toast } = useToast();
  const [preferences, setPreferences] = useState<NotificationPreferences>(initialPreferences);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(category: NotificationCategory, checked: boolean) {
    setError(null);
    const next = { ...preferences, [category]: checked };
    setPreferences(next);
    startTransition(async () => {
      const result = await updateNotificationPreferences(next);
      if (!result.ok) {
        setPreferences(preferences);
        setError(result.formError ?? "Could not save your notification preferences.");
        return;
      }
      toast({ title: result.message ?? "Saved.", tone: "success" });
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      {NOTIFICATION_CATEGORIES.map((category, index) => (
        <div key={category}>
          <Switch
            label={CATEGORY_LABELS[category]}
            description={CATEGORY_DESCRIPTIONS[category]}
            checked={preferences[category] ?? true}
            onCheckedChange={(checked) => toggle(category, checked)}
            disabled={isPending}
          />
          {index < NOTIFICATION_CATEGORIES.length - 1 ? (
            <div className="mt-4 border-t border-border" aria-hidden="true" />
          ) : null}
        </div>
      ))}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
