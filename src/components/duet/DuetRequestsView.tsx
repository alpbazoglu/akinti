"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Mic, X } from "@/components/ui/icons";
import { Avatar, Badge, Button, EmptyState, TabPanel, Tabs, tabId, tabPanelId, useActionToast } from "@/components/ui";
import { routes } from "@/config/routes";
import { cn, timeAgo, useIsDesktopViewport } from "@/lib/ui";
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

const STATUS_LABEL_KEY = {
  pending: "statusPending",
  accepted: "statusAccepted",
  declined: "statusDeclined",
  cancelled: "statusCancelled",
  expired: "statusExpired",
} as const satisfies Record<DuetRequestStatus, string>;

/** A Link styled as a secondary key (`akinti-press`/`rounded-key`, DESIGN.md §8.7) — the same treatment `w/[id]/page.tsx` uses for its "View lineage" link, since `Button` itself only renders a `<button>`. */
const LINK_KEY =
  "akinti-press inline-flex h-10 w-fit items-center gap-2 rounded-key border border-hairline-strong px-4 type-subhead text-ink transition-colors hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide";

/** The current-filled equivalent of `Button variant="primary"`, for a Link that needs the same weight as "Accept" (COLOR_V2 "Buttons": primary = current fill, paper text). */
const LINK_KEY_PRIMARY =
  "akinti-press inline-flex h-10 w-fit items-center gap-2 rounded-key bg-tide px-4 type-subhead text-on-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide";

/**
 * Tabs + list for `/duets` (spec §15 deliverable 2). Data-fetching stays in
 * the Server Component; this only renders and calls the Server Actions.
 *
 * Desktop (this pass's brief, item 3: "requests inbox as a two-pane
 * list/detail") swaps the single list for a compact row list on the left and
 * the full message/actions for whichever request is selected on the right —
 * picked once via `useIsDesktopViewport`, mobile's original single-column
 * list (with the actions inline on every row) is unchanged below `lg`.
 */
export function DuetRequestsView({ received, sent }: DuetRequestsViewProps) {
  const t = useTranslations("DuetRequestsView");
  const [tab, setTab] = useState<Tab>("received");
  const isDesktop = useIsDesktopViewport();

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        items={[
          { value: "received", label: t("received") },
          { value: "sent", label: t("sent") },
        ]}
        value={tab}
        onValueChange={(value) => setTab(value as Tab)}
        label={t("tabsLabel")}
        variant="segmented"
        idPrefix={TAB_ID_PREFIX}
        className="self-start"
      />

      {/* Both `TabPanel`s always mount (only their `hidden` attribute and
          content differ, per `TabPanel`'s own implementation) so each tab
          button's `aria-controls` target always exists in the DOM — true on
          mobile already; the desktop branch below must keep it true too. */}
      <TabPanel id={tabPanelId(TAB_ID_PREFIX, "received")} labelledBy={tabId(TAB_ID_PREFIX, "received")} active={tab === "received"}>
        {isDesktop ? (
          <DuetRequestsTwoPane
            items={received}
            variant="received"
            emptyTitle={t("emptyReceivedTitle")}
            emptyDescription={t("emptyReceivedDescription")}
          />
        ) : (
          <RequestList items={received} variant="received" emptyTitle={t("emptyReceivedTitle")} emptyDescription={t("emptyReceivedDescription")} />
        )}
      </TabPanel>
      <TabPanel id={tabPanelId(TAB_ID_PREFIX, "sent")} labelledBy={tabId(TAB_ID_PREFIX, "sent")} active={tab === "sent"}>
        {isDesktop ? (
          <DuetRequestsTwoPane
            items={sent}
            variant="sent"
            emptyTitle={t("emptySentTitle")}
            emptyDescription={t("emptySentDescription")}
          />
        ) : (
          <RequestList items={sent} variant="sent" emptyTitle={t("emptySentTitle")} emptyDescription={t("emptySentDescription")} />
        )}
      </TabPanel>
    </div>
  );
}

/** `runAction`'s pending/error state, shared between the mobile row's inline actions and the desktop detail pane's actions — each caller mounts its own instance. */
function useRequestRunAction() {
  const t = useTranslations("DuetRequestsView");
  const router = useRouter();
  const { notify } = useActionToast();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const runAction = (task: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        setError(result.error ?? t("genericError"));
        notify("duet", "error");
        return;
      }
      notify("duet", "success");
      router.refresh();
    });
  };

  return { error, isPending, runAction };
}

function RequestList({
  items,
  variant,
  emptyTitle,
  emptyDescription,
}: {
  items: readonly DuetRequestListItem[];
  variant: "received" | "sent";
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} size="sm" />;
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
  const t = useTranslations("DuetRequestsView");
  const name = item.counterpart.displayName ?? item.counterpart.username;
  const { error, isPending, runAction } = useRequestRunAction();

  return (
    <div className="akinti-rail py-4">
      <Link href={routes.profile(item.counterpart.username)} className="self-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide">
        <Avatar name={name} src={item.counterpart.avatarUrl} size="md" />
      </Link>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-col gap-1">
          <p className="type-body-sm measure text-ink">
            <Link
              href={routes.profile(item.counterpart.username)}
              className="type-subhead text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
            >
              {name}
            </Link>{" "}
            <span className="text-ink-muted">
              {variant === "received" ? t("wantsToDuetOn") : t("wasAskedToDuetOn")}
            </span>{" "}
            <Link
              href={routes.wave(item.waveId)}
              className="type-subhead text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
            >
              {item.waveTitle}
            </Link>
          </p>
          <div className="flex items-center gap-2">
            <time dateTime={item.createdAt} className="type-mono-sm text-ink-subtle">
              {timeAgo(item.createdAt)}
            </time>
            <Badge>{t(STATUS_LABEL_KEY[item.status])}</Badge>
          </div>
          {item.message ? <p className="type-body-sm measure mt-1 text-ink-muted">“{item.message}”</p> : null}
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

/**
 * Desktop two-pane (this pass's brief, item 3): a compact selectable row
 * list on the left, the selected request's full message and actions on the
 * right. The selection resets to the first item whenever the tab (and so
 * `items`) changes, rather than pointing at a row that no longer exists.
 */
function DuetRequestsTwoPane({
  items,
  variant,
  emptyTitle,
  emptyDescription,
}: {
  items: readonly DuetRequestListItem[];
  variant: "received" | "sent";
  emptyTitle: string;
  emptyDescription: string;
}) {
  // No effect needed to keep this in sync: `selected` below always falls
  // back to the current tab's first item whenever `selectedId` points at a
  // request from a tab the reader has since switched away from — the state
  // itself is only ever written by the row's own click handler.
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} size="sm" />;
  }

  const selected = items.find((item) => item.id === selectedId) ?? items[0]!;

  return (
    <div className="grid grid-cols-[320px_1fr] gap-6">
      <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
        {items.map((item) => {
          const name = item.counterpart.displayName ?? item.counterpart.username;
          const isSelected = item.id === selected.id;
          return (
            <li key={item.id}>
              <RequestListRowButton
                item={item}
                name={name}
                isSelected={isSelected}
                onSelect={() => setSelectedId(item.id)}
              />
            </li>
          );
        })}
      </ul>

      <RequestDetailPane key={selected.id} item={selected} variant={variant} />
    </div>
  );
}

function RequestListRowButton({
  item,
  name,
  isSelected,
  onSelect,
}: {
  item: DuetRequestListItem;
  name: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("DuetRequestsView");
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isSelected || undefined}
      className={cn(
        "akinti-rail w-full py-3 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-tide",
        isSelected ? "bg-elevation-2" : "hover:bg-elevation-2",
      )}
    >
      <Avatar name={name} src={item.counterpart.avatarUrl} size="sm" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="type-subhead truncate text-ink">{name}</span>
        <span className="type-caption truncate text-ink-subtle">{item.waveTitle}</span>
        <div className="flex items-center gap-2 pt-0.5">
          <time dateTime={item.createdAt} className="type-mono-sm text-ink-subtle">
            {timeAgo(item.createdAt)}
          </time>
          <Badge>{t(STATUS_LABEL_KEY[item.status])}</Badge>
        </div>
      </div>
    </button>
  );
}

function RequestDetailPane({ item, variant }: { item: DuetRequestListItem; variant: "received" | "sent" }) {
  const t = useTranslations("DuetRequestsView");
  const name = item.counterpart.displayName ?? item.counterpart.username;
  const { error, isPending, runAction } = useRequestRunAction();

  return (
    <div className="flex flex-col gap-4 rounded-card border border-hairline bg-elevation-2 p-6">
      <div className="flex items-center gap-3">
        <Link href={routes.profile(item.counterpart.username)} className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide">
          <Avatar name={name} src={item.counterpart.avatarUrl} size="lg" />
        </Link>
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            href={routes.profile(item.counterpart.username)}
            className="type-heading text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
          >
            {name}
          </Link>
          <div className="flex items-center gap-2">
            <time dateTime={item.createdAt} className="type-mono-sm text-ink-subtle">
              {timeAgo(item.createdAt)}
            </time>
            <Badge>{t(STATUS_LABEL_KEY[item.status])}</Badge>
          </div>
        </div>
      </div>

      <p className="type-body-sm measure text-ink">
        <span className="text-ink-muted">{variant === "received" ? t("wantsToDuetOn") : t("wasAskedToDuetOn")}</span>{" "}
        <Link
          href={routes.wave(item.waveId)}
          className="type-subhead text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
        >
          {item.waveTitle}
        </Link>
      </p>

      {item.message ? <p className="type-body measure border-t border-hairline pt-4 text-ink-muted">“{item.message}”</p> : null}

      {error ? (
        <p role="alert" className="type-caption text-signal-deep">
          {error}
        </p>
      ) : null}

      <div className="pt-2">
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
  const t = useTranslations("DuetRequestsView");

  if (variant === "received" && item.status === "pending") {
    return (
      <div className={cn("flex items-center gap-2")}>
        <Button
          size="sm"
          loading={isPending}
          leadingIcon={<Check className="size-4" />}
          onClick={() => runAction(() => respondToDuetRequest(item.id, "accepted"))}
        >
          {t("accept")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={isPending}
          leadingIcon={<X className="size-4" />}
          onClick={() => runAction(() => respondToDuetRequest(item.id, "declined"))}
        >
          {t("decline")}
        </Button>
      </div>
    );
  }

  if (variant === "sent" && item.status === "pending") {
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" loading={isPending} onClick={() => runAction(() => cancelDuetRequest(item.id))}>
          {t("cancelRequest")}
        </Button>
      </div>
    );
  }

  if (variant === "sent" && item.status === "accepted") {
    if (item.resultingWaveId) {
      return (
        <Link href={routes.wave(item.resultingWaveId)} className={LINK_KEY}>
          {t("viewYourDuet")}
        </Link>
      );
    }
    return (
      <Link href={routes.duetRecord(item.waveId, item.id)} className={LINK_KEY_PRIMARY}>
        <Mic className="size-4" aria-hidden="true" />
        {t("recordYourDuet")}
      </Link>
    );
  }

  return null;
}
