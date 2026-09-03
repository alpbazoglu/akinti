"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Handshake, Mic, X } from "lucide-react";

import { Avatar, Badge, type BadgeTone, Button, EmptyState, TabPanel, Tabs, tabId, tabPanelId } from "@/components/ui";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { cn, timeAgo } from "@/lib/ui";
import type { DuetRequestStatus } from "@/types/domain";

import { cancelDuetRequest, respondToDuetRequest } from "@/app/(app)/duets/actions";

export interface DuetRequestListPerson {
  readonly username: string;
  readonly displayName?: string | null;
  readonly avatarUrl?: string | null;
}

export interface DuetRequestListItem {
  readonly id: string;
  readonly waveId: string;
  readonly waveTitle: string;
  readonly counterpart: DuetRequestListPerson;
  readonly message: string | null;
  readonly status: DuetRequestStatus;
  readonly createdAt: string;
  readonly resultingWaveId: string | null;
}

export interface DuetRequestsViewProps {
  received: readonly DuetRequestListItem[];
  sent: readonly DuetRequestListItem[];
}

type Tab = "received" | "sent";

const TAB_ID_PREFIX = "duets";

const STATUS_TONE: Record<DuetRequestStatus, BadgeTone> = {
  pending: "warning",
  accepted: "success",
  declined: "neutral",
  cancelled: "neutral",
  expired: "neutral",
};

const STATUS_LABEL: Record<DuetRequestStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
};

/** Tabs + list for `/duets` (spec §15 deliverable 2). Data-fetching stays in the Server Component; this only renders and calls the Server Actions. */
export function DuetRequestsView({ received, sent }: DuetRequestsViewProps) {
  const [tab, setTab] = useState<Tab>("received");

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        items={[
          { value: "received", label: "Received", },
          { value: "sent", label: "Sent" },
        ]}
        value={tab}
        onValueChange={(value) => setTab(value as Tab)}
        label={`${TERMS.duetRequests} tabs`}
        variant="segmented"
        idPrefix={TAB_ID_PREFIX}
        className="self-start"
      />

      <TabPanel id={tabPanelId(TAB_ID_PREFIX, "received")} labelledBy={tabId(TAB_ID_PREFIX, "received")} active={tab === "received"}>
        <RequestList items={received} variant="received" emptyDescription={`When someone asks to Duet on one of your Waves, it shows up here.`} />
      </TabPanel>
      <TabPanel id={tabPanelId(TAB_ID_PREFIX, "sent")} labelledBy={tabId(TAB_ID_PREFIX, "sent")} active={tab === "sent"}>
        <RequestList items={sent} variant="sent" emptyDescription={`Requests you send to Duet on someone else's Wave show up here.`} />
      </TabPanel>
    </div>
  );
}

function RequestList({
  items,
  variant,
  emptyDescription,
}: {
  items: readonly DuetRequestListItem[];
  variant: "received" | "sent";
  emptyDescription: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Handshake className="size-6" />}
        title={`No ${variant === "received" ? "received" : "sent"} ${TERMS.duetRequests.toLowerCase()}`}
        description={emptyDescription}
        size="sm"
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id}>
          <RequestRow item={item} variant={variant} />
        </li>
      ))}
    </ul>
  );
}

function RequestRow({ item, variant }: { item: DuetRequestListItem; variant: "received" | "sent" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const name = item.counterpart.displayName ?? item.counterpart.username;

  const runAction = (task: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Try again.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <Link href={routes.profile(item.counterpart.username)} className="shrink-0">
          <Avatar name={name} src={item.counterpart.avatarUrl} size="md" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-sm text-fg">
            <Link href={routes.profile(item.counterpart.username)} className="font-medium hover:underline">
              {name}
            </Link>{" "}
            <span className="text-fg-subtle">
              {variant === "received" ? "wants to Duet on" : "— your request on"}
            </span>{" "}
            <Link href={routes.wave(item.waveId)} className="font-medium hover:underline">
              {item.waveTitle}
            </Link>
          </p>
          <p className="text-xs text-fg-subtle">{timeAgo(item.createdAt)}</p>
          {item.message ? <p className="mt-1 text-sm text-fg-muted">&ldquo;{item.message}&rdquo;</p> : null}
        </div>
        <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      <RequestActions item={item} variant={variant} isPending={isPending} runAction={runAction} />
    </div>
  );
}

function RequestActions({
  item,
  variant,
  isPending,
  runAction,
}: {
  item: DuetRequestListItem;
  variant: "received" | "sent";
  isPending: boolean;
  runAction: (task: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  if (variant === "received" && item.status === "pending") {
    return (
      <div className={cn("flex items-center gap-2")}>
        <Button
          size="sm"
          loading={isPending}
          leadingIcon={<Check className="size-4" />}
          onClick={() => runAction(() => respondToDuetRequest(item.id, "accepted"))}
        >
          Accept
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={isPending}
          leadingIcon={<X className="size-4" />}
          onClick={() => runAction(() => respondToDuetRequest(item.id, "declined"))}
        >
          Decline
        </Button>
      </div>
    );
  }

  if (variant === "sent" && item.status === "pending") {
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" loading={isPending} onClick={() => runAction(() => cancelDuetRequest(item.id))}>
          Cancel request
        </Button>
      </div>
    );
  }

  if (variant === "sent" && item.status === "accepted") {
    if (item.resultingWaveId) {
      return (
        <Link
          href={routes.wave(item.resultingWaveId)}
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          View your Duet
        </Link>
      );
    }
    return (
      <Link
        href={routes.duetRecord(item.waveId, item.id)}
        className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-fg-on-accent hover:bg-accent-hover"
      >
        <Mic className="size-4" aria-hidden="true" />
        Record your Duet
      </Link>
    );
  }

  return null;
}
