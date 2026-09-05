"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Mic, X } from "@/components/ui/icons";
import { Avatar, Badge, Button, EmptyState, TabPanel, Tabs, tabId, tabPanelId } from "@/components/ui";
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

const STATUS_LABEL: Record<DuetRequestStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
};

/** A Link styled as a secondary key (`akinti-press`/`rounded-key`, DESIGN.md §8.7) — the same treatment `w/[id]/page.tsx` uses for its "View lineage" link, since `Button` itself only renders a `<button>`. */
const LINK_KEY =
  "akinti-press inline-flex h-10 w-fit items-center gap-2 rounded-key border border-hairline-strong px-4 type-subhead text-ink transition-colors hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** The ink-filled equivalent of `Button variant="primary"`, for a Link that needs the same weight as "Accept". */
const LINK_KEY_PRIMARY =
  "akinti-press inline-flex h-10 w-fit items-center gap-2 rounded-key bg-ink px-4 type-subhead text-on-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

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
        title={`No ${variant === "received" ? "received" : "sent"} ${TERMS.duetRequests.toLowerCase()}`}
        description={emptyDescription}
        size="sm"
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
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
    <div className="akinti-rail py-4">
      <Link href={routes.profile(item.counterpart.username)} className="self-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        <Avatar name={name} src={item.counterpart.avatarUrl} size="md" />
      </Link>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-col gap-1">
          <p className="type-body-sm measure text-ink">
            <Link
              href={routes.profile(item.counterpart.username)}
              className="type-subhead text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {name}
            </Link>{" "}
            <span className="text-ink-muted">
              {variant === "received" ? "wants to duet on" : "was asked to duet on"}
            </span>{" "}
            <Link
              href={routes.wave(item.waveId)}
              className="type-subhead text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {item.waveTitle}
            </Link>
          </p>
          <div className="flex items-center gap-2">
            <time dateTime={item.createdAt} className="type-mono-sm text-ink-subtle">
              {timeAgo(item.createdAt)}
            </time>
            <Badge>{STATUS_LABEL[item.status]}</Badge>
          </div>
          {item.message ? <p className="type-body-sm measure mt-1 text-ink-muted">&ldquo;{item.message}&rdquo;</p> : null}
        </div>

        {error ? (
          <p role="alert" className="type-caption text-signal-deep">
            {error}
          </p>
        ) : null}

        <RequestActions item={item} variant={variant} isPending={isPending} runAction={runAction} />
      </div>
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
        <Link href={routes.wave(item.resultingWaveId)} className={LINK_KEY}>
          View your Duet
        </Link>
      );
    }
    return (
      <Link href={routes.duetRecord(item.waveId, item.id)} className={LINK_KEY_PRIMARY}>
        <Mic className="size-4" aria-hidden="true" />
        Record your Duet
      </Link>
    );
  }

  return null;
}
