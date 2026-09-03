"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleCheck, CircleX, Clock, Mic2, TriangleAlert, XCircle } from "lucide-react";

import { getDuetRequestCard } from "@/app/(app)/messages/actions";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { Badge, Skeleton, type BadgeTone } from "@/components/ui";
import type { DuetRequest, DuetRequestStatus, Wave } from "@/types/domain";

export interface DuetRequestCardProps {
  duetRequestId: string;
}

const STATUS_META: Record<DuetRequestStatus, { label: string; tone: BadgeTone; icon: typeof Mic2 }> = {
  pending: { label: "Pending", tone: "accent", icon: Clock },
  accepted: { label: "Accepted", tone: "success", icon: CircleCheck },
  declined: { label: "Declined", tone: "danger", icon: CircleX },
  cancelled: { label: "Cancelled", tone: "neutral", icon: XCircle },
  expired: { label: "Expired", tone: "neutral", icon: Clock },
};

/**
 * Status card for a `duet_request` message (spec §22 deliverable 5): render
 * only — requests are created in the Duet stage. Shows the lifecycle state
 * (`DuetRequestStatus`) and links to the Wave in question.
 */
export function DuetRequestCard({ duetRequestId }: DuetRequestCardProps) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; request: DuetRequest; wave: Wave | null }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    void getDuetRequestCard(duetRequestId).then((result) => {
      if (cancelled) return;
      if (result.ok && result.data) {
        setState({ status: "ready", request: result.data.request, wave: result.data.wave });
      } else {
        setState({ status: "error", message: result.error ?? "This Duet Request is no longer available." });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [duetRequestId]);

  if (state.status === "loading") {
    return (
      <div className="flex w-64 flex-col gap-2 rounded-xl border border-border p-3">
        <Skeleton shape="line" width="60%" />
        <Skeleton shape="line" width="40%" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <p role="alert" className="flex w-64 items-center gap-1.5 rounded-xl border border-border p-3 text-sm text-danger">
        <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
        {state.message}
      </p>
    );
  }

  const { request, wave } = state;
  const meta = STATUS_META[request.status];
  const StatusIcon = meta.icon;

  const content = (
    <div className="flex w-64 flex-col gap-2 rounded-xl border border-border p-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-fg">
        <Mic2 className="size-4 shrink-0 text-accent" aria-hidden="true" />
        {TERMS.duetRequest}
      </div>
      {wave ? <p className="truncate text-xs text-fg-muted">{wave.title}</p> : null}
      <Badge tone={meta.tone} icon={<StatusIcon className="size-3.5" aria-hidden="true" />}>
        {meta.label}
      </Badge>
    </div>
  );

  if (!wave) {
    return content;
  }

  return (
    <Link
      href={routes.wave(wave.id)}
      className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {content}
    </Link>
  );
}
