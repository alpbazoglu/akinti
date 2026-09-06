"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { WaveCardContainer } from "@/components/wave";
import { Button, EmptyState } from "@/components/ui";
import { mergePageById, type ContentWaveCard } from "@/lib/interactions";

import type { ContentListResult } from "./actions";

export interface ContentWaveListProps {
  initialItems: ContentWaveCard[];
  initialCursor: string | null;
  loadMore: (cursor: string | null) => Promise<ContentListResult>;
  emptyTitle: string;
  emptyDescription: string;
}

/**
 * The shared list behind all four Content tabs (spec §25: Saved, Commented,
 * Waves, Duets) — server-rendered first page, client "Load more" cursor
 * pagination, each Wave rendered as a full `WaveCardContainer` so Save/Share/
 * Comment/Request-a-Duet all work directly from Settings.
 */
export function ContentWaveList({
  initialItems,
  initialCursor,
  loadMore,
  emptyTitle,
  emptyDescription,
}: ContentWaveListProps) {
  const t = useTranslations("ContentWaveList");
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleLoadMore = () => {
    if (!cursor) return;
    setError(null);
    startTransition(async () => {
      const result = await loadMore(cursor);
      if (!result.ok || !result.data) {
        setError(result.error ?? t("couldNotLoadMore"));
        return;
      }
      setItems((current) => mergePageById(current, result.data!.items));
      setCursor(result.data.nextCursor);
    });
  };

  if (items.length === 0) {
    return <EmptyState size="sm" title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <WaveCardContainer key={item.id} wave={item} />
      ))}

      {error ? (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      ) : null}

      {cursor ? (
        <Button variant="secondary" size="sm" loading={isPending} onClick={handleLoadMore} className="self-center">
          {t("loadMore")}
        </Button>
      ) : null}
    </div>
  );
}
