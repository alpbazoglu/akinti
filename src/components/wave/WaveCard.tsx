"use client";

import Link from "next/link";
import { Bookmark, Handshake, MessageSquare, Share2 } from "lucide-react";
import type { ReactNode } from "react";

import { WavePlayer } from "@/components/audio";
import { Avatar, Badge, Button, Skeleton } from "@/components/ui";
import {
  CREATION_TYPES,
  METRICS,
  TERMS,
  type CreationType,
  type MetricKey,
} from "@/config/terminology";
import { routes } from "@/config/routes";
import type { PlaybackEndedEvent, PlaybackProgressEvent } from "@/lib/audio";
import { cn, formatAbsoluteTime, formatCount, timeAgo, toIsoString } from "@/lib/ui";

export interface WaveCardPerson {
  readonly username: string;
  readonly displayName?: string;
  readonly avatarUrl?: string | null;
}

/** Social signals shown on a card. There is no Like signal (spec section 3.4). */
export type WaveCardMetrics = Readonly<Record<MetricKey, number>>;

export interface WaveCardWave {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly createdAt: string | number | Date;
  readonly creator: WaveCardPerson;
  readonly collaborators?: readonly WaveCardPerson[];
  readonly creationType: CreationType;
  readonly audioUrl: string;
  readonly peaks: readonly number[];
  readonly duration?: number;
  readonly metrics: WaveCardMetrics;
  readonly isSaved?: boolean;
  /** False when the creator does not accept Duet Requests (spec section 15). */
  readonly canRequestDuet?: boolean;
}

export interface WaveCardProps {
  wave: WaveCardWave;
  onComment?: (waveId: string) => void;
  onSave?: (waveId: string) => void;
  onShare?: (waveId: string) => void;
  onRequestDuet?: (waveId: string) => void;
  /** Raw playback ticks; a metrics layer decides what counts as a Play. */
  onProgress?: (event: PlaybackProgressEvent) => void;
  onEnded?: (event: PlaybackEndedEvent) => void;
  /** Overflow menu, report action, etc. */
  headerAction?: ReactNode;
  /** Renders the card without its own border, e.g. on a Wave detail page. */
  flush?: boolean;
  className?: string;
}

/**
 * The Wave card (spec section 11). Presentation only: it takes data and emits
 * callbacks, and holds no data-fetching or metrics logic of its own.
 *
 * Structure, in order:
 *   Creator - Username - Timestamp - Creation type
 *   Title
 *   Waveform + transport
 *   Description
 *   Collaborators
 *   Plays - Replays - Comments - Saves - Shares - Duets
 *   Request a Duet
 */
export function WaveCard({
  wave,
  onComment,
  onSave,
  onShare,
  onRequestDuet,
  onProgress,
  onEnded,
  headerAction,
  flush = false,
  className,
}: WaveCardProps) {
  const creationType = CREATION_TYPES[wave.creationType];
  const creatorName = wave.creator.displayName ?? wave.creator.username;
  const collaborators = wave.collaborators ?? [];
  const canRequestDuet = wave.canRequestDuet ?? true;

  return (
    <article
      aria-labelledby={`wave-${wave.id}-title`}
      className={cn(
        "flex flex-col gap-3 bg-surface p-4 sm:p-5",
        !flush && "rounded-xl border border-border shadow-xs",
        className,
      )}
    >
      {/* Creator - Username - Timestamp - Creation type */}
      <header className="flex items-start gap-3">
        <Link
          href={routes.profile(wave.creator.username)}
          className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Avatar name={creatorName} src={wave.creator.avatarUrl} size="md" />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Link
              href={routes.profile(wave.creator.username)}
              className="truncate text-sm font-semibold text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {creatorName}
            </Link>
            <span className="truncate text-sm text-fg-subtle">
              @{wave.creator.username}
            </span>
            <span aria-hidden="true" className="text-fg-subtle">
              &middot;
            </span>
            <time
              dateTime={toIsoString(wave.createdAt)}
              title={formatAbsoluteTime(wave.createdAt)}
              className="text-sm text-fg-subtle"
            >
              {timeAgo(wave.createdAt)}
            </time>
          </div>
          <Badge tone="accent" icon={creationType.glyph}>
            {creationType.label}
          </Badge>
        </div>

        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </header>

      {/* Title */}
      <h3 id={`wave-${wave.id}-title`} className="text-base leading-snug font-semibold text-fg">
        <Link
          href={routes.wave(wave.id)}
          className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {wave.title}
        </Link>
      </h3>

      {/* Waveform + transport */}
      <WavePlayer
        waveId={wave.id}
        src={wave.audioUrl}
        peaks={wave.peaks}
        duration={wave.duration}
        title={wave.title}
        creatorUsername={wave.creator.username}
        onProgress={onProgress}
        onEnded={onEnded}
      />

      {/* Description */}
      {wave.description ? (
        <p className="text-sm leading-relaxed whitespace-pre-line text-fg-muted">
          {wave.description}
        </p>
      ) : null}

      {/* Collaborators */}
      {collaborators.length > 0 ? (
        <p className="flex flex-wrap items-center gap-1 text-sm text-fg-subtle">
          <span className="font-medium text-fg-muted">{TERMS.collaborators}:</span>
          {collaborators.map((person, index) => (
            <span key={person.username} className="inline-flex items-center gap-1">
              {index > 0 ? (
                <span aria-hidden="true" className="text-fg-subtle">
                  &times;
                </span>
              ) : null}
              <Link
                href={routes.profile(person.username)}
                className="text-fg-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                @{person.username}
              </Link>
            </span>
          ))}
        </p>
      ) : null}

      {/* Plays - Replays - Comments - Saves - Shares - Duets */}
      <MetricsRow metrics={wave.metrics} />

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onComment?.(wave.id)}
          leadingIcon={<MessageSquare className="size-4" />}
        >
          {TERMS.comment}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSave?.(wave.id)}
          aria-pressed={wave.isSaved ?? false}
          leadingIcon={
            <Bookmark className={cn("size-4", wave.isSaved && "fill-current")} />
          }
          className={cn(wave.isSaved && "text-accent")}
        >
          {wave.isSaved ? TERMS.saved : TERMS.save}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onShare?.(wave.id)}
          leadingIcon={<Share2 className="size-4" />}
        >
          {TERMS.share}
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={() => onRequestDuet?.(wave.id)}
          disabled={!canRequestDuet}
          leadingIcon={<Handshake className="size-4" />}
          className="ml-auto"
        >
          {TERMS.requestDuet}
        </Button>
      </div>
    </article>
  );
}

interface MetricsRowProps {
  metrics: WaveCardMetrics;
}

function MetricsRow({ metrics }: MetricsRowProps) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
      {METRICS.map((metric) => {
        const value = metrics[metric.key] ?? 0;
        return (
          <li key={metric.key} className="inline-flex items-center gap-1">
            <span className="font-medium text-fg-muted tabular-nums">
              {formatCount(value)}
            </span>
            <span>{value === 1 ? metric.singular : metric.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export interface WaveCardSkeletonProps {
  flush?: boolean;
  className?: string;
}

/** Loading placeholder matching the shape of a real Wave card. */
export function WaveCardSkeleton({ flush = false, className }: WaveCardSkeletonProps) {
  return (
    <div
      role="status"
      aria-label={`Loading ${TERMS.aWave}`}
      className={cn(
        "flex flex-col gap-3 bg-surface p-4 sm:p-5",
        !flush && "rounded-xl border border-border shadow-xs",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Skeleton shape="circle" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton width="45%" />
          <Skeleton width="25%" height="1.25rem" className="rounded-full" />
        </div>
      </div>
      <Skeleton width="70%" height="1.1rem" />
      <div className="flex items-center gap-3">
        <Skeleton shape="circle" className="size-12" />
        <Skeleton height="3.25rem" className="flex-1 rounded-md" />
      </div>
      <Skeleton width="90%" />
      <Skeleton width="60%" />
      <div className="flex gap-2 border-t border-border pt-3">
        <Skeleton width="5rem" height="2rem" className="rounded-full" />
        <Skeleton width="5rem" height="2rem" className="rounded-full" />
        <Skeleton width="5rem" height="2rem" className="rounded-full" />
      </div>
    </div>
  );
}
