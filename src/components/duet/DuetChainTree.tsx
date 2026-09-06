"use client";

/**
 * The Duet chain, drawn as a horizontal tree (this pass's brief, item 2).
 *
 * Extracted from the Server Component `DuetChain` that used to live inline
 * in `src/app/(app)/w/[id]/page.tsx` (a vertical, indentation-only list) —
 * the data shape is unchanged (`DuetTreeNode[]` + `currentWaveId`, already
 * fully hydrated server-side by `getDuetTree`, `src/lib/db/duets.ts`), only
 * the drawing is new. This has to be a Client Component because "hover
 * highlights the path" needs local interaction state; the props stay plain,
 * serialisable data, which is exactly what a Server Component is allowed to
 * hand a Client Component.
 *
 * Layout: each node sits left of its children, connected by the product's
 * one drawing primitive in miniature — a dashed "trace" rather than a solid
 * rule, echoing the dormant waterline's row of ticks (`docs/design/
 * SCREENS.md` §4.1) instead of inventing a second line style. A node with
 * more than one child fans them out vertically with a spine; the common case
 * (a linear chain, one reply at a time) never needs one. Hovering or
 * focusing a node highlights every edge from the root down to it — the
 * "path", not just the node itself.
 *
 * Translations: this renders under both `/w/[id]` (message namespaces
 * narrowed per route group, `src/app/(app)/w/[id]/layout.tsx`, not owned by
 * this pass) and `/duets` (no such narrowing). "WavePage" is already
 * whitelisted there and already carries the two strings this needs
 * (`duetChain`, `youAreHere`) — reused verbatim rather than forked into a new
 * namespace this component could not register itself.
 */

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import Link from "next/link";

import { Avatar } from "@/components/ui";
import { Queue, Repeat, Shuffle } from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { cn, timeAgo } from "@/lib/ui";
import type { DuetMode, DuetTreeNode } from "@/types/domain";
import type { IconComponent } from "@/components/ui/icons";

export interface DuetChainTreeProps {
  nodes: readonly DuetTreeNode[];
  currentWaveId: string;
  className?: string;
}

const MODE_ICON: Readonly<Record<DuetMode, IconComponent>> = {
  layer: Queue,
  atisma: Shuffle,
  cypher: Repeat,
};

/** Root-to-node id path for every node in the forest, keyed by wave id. */
function buildAncestry(
  nodes: readonly DuetTreeNode[],
  trail: readonly string[],
  out: Map<string, readonly string[]>,
): void {
  for (const node of nodes) {
    const path = [...trail, node.wave.id];
    out.set(node.wave.id, path);
    buildAncestry(node.children, path, out);
  }
}

export function DuetChainTree({ nodes, currentWaveId, className }: DuetChainTreeProps) {
  const t = useTranslations("WavePage");
  const tTerms = useTranslations("Terms");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const ancestry = useMemo(() => {
    const map = new Map<string, readonly string[]>();
    buildAncestry(nodes, [], map);
    return map;
  }, [nodes]);

  const hoveredPath = hoveredId ? (ancestry.get(hoveredId) ?? []) : [];

  return (
    <section aria-labelledby="duet-chain" className={className}>
      <h2 id="duet-chain" className="type-caption-strong pb-3 text-ink-muted">
        {t("duetChain", { duet: tTerms("duet") })}
      </h2>
      <div className="overflow-x-auto pb-2">
        <ul className="flex flex-col gap-6 py-1 pl-1">
          {nodes.map((root) => (
            <ChainNode
              key={root.wave.id}
              node={root}
              currentWaveId={currentWaveId}
              hoveredPath={hoveredPath}
              onHover={setHoveredId}
              youAreHere={t("youAreHere")}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

/** A dashed "trace" stub — the connector, never a plain solid rule. */
function Trace({ active, className }: { active: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "shrink-0 border-dashed transition-colors duration-[--dur-quick]",
        active ? "border-tide" : "border-hairline-strong",
        className,
      )}
    />
  );
}

interface ChainNodeProps {
  node: DuetTreeNode;
  currentWaveId: string;
  hoveredPath: readonly string[];
  onHover: (id: string | null) => void;
  youAreHere: string;
}

function ChainNode({ node, currentWaveId, hoveredPath, onHover, youAreHere }: ChainNodeProps) {
  const isCurrent = node.wave.id === currentWaveId;
  const onPath = hoveredPath.includes(node.wave.id);
  const name = node.creator.displayName ?? node.creator.username;
  const Icon = node.wave.duet.mode ? MODE_ICON[node.wave.duet.mode] : null;
  const hasChildren = node.children.length > 0;
  const multiBranch = node.children.length > 1;

  return (
    <li className="flex items-center">
      <Link
        href={routes.wave(node.wave.id)}
        aria-current={isCurrent ? "page" : undefined}
        onMouseEnter={() => onHover(node.wave.id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(node.wave.id)}
        onBlur={() => onHover(null)}
        className={cn(
          "flex w-[176px] shrink-0 items-center gap-2.5 rounded-object border px-3 py-2.5 transition-colors duration-[--dur-quick]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide",
          isCurrent
            ? "border-tide bg-elevation-2"
            : onPath
              ? "border-hairline-strong bg-elevation-2"
              : "border-hairline hover:border-hairline-strong hover:bg-elevation-2/60",
        )}
      >
        <Avatar name={name} src={node.creator.avatarUrl} size="sm" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="type-caption-strong flex items-center gap-1 truncate text-ink">
            {Icon ? <Icon className="size-3.5 shrink-0 text-ink-subtle" aria-hidden="true" /> : null}
            <span className="truncate">{node.wave.title}</span>
          </span>
          <span className="type-micro truncate text-ink-subtle">
            @{node.creator.username}
            <span aria-hidden="true"> · </span>
            {timeAgo(node.wave.publishedAt)}
            {isCurrent ? (
              <>
                <span aria-hidden="true"> · </span>
                {youAreHere}
              </>
            ) : null}
          </span>
        </span>
      </Link>

      {hasChildren ? (
        <div className="flex items-stretch">
          <Trace active={onPath && hoveredPath.includes(node.children[0]!.wave.id)} className="w-6 self-center border-t-2" />
          {multiBranch ? (
            <div className="relative flex flex-col justify-center gap-6">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-6 bottom-6 w-0 border-l-2 border-dashed border-hairline-strong"
              />
              <ul className="flex flex-col gap-6">
                {node.children.map((child) => {
                  const edgeActive = hoveredPath.includes(child.wave.id);
                  return (
                    <li key={child.wave.id} className="flex items-center">
                      <Trace active={edgeActive} className="w-4 self-center border-t-2" />
                      <ChainNode
                        node={child}
                        currentWaveId={currentWaveId}
                        hoveredPath={hoveredPath}
                        onHover={onHover}
                        youAreHere={youAreHere}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            // A single child is still one list item, not a bare `<li>`
            // dropped straight into this `<div>` (axe "listitem": every
            // `<li>` needs a `<ul>`/`<ol>`/`role="list"` parent) — the
            // common case, since most chains reply one at a time.
            <ul className="flex flex-col">
              <ChainNode
                node={node.children[0]!}
                currentWaveId={currentWaveId}
                hoveredPath={hoveredPath}
                onHover={onHover}
                youAreHere={youAreHere}
              />
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}
