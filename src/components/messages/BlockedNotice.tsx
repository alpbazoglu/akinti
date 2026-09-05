import { Ban } from "@/components/ui/icons";

/** Shown above a blocked-either-way thread (spec §26) — the composer is disabled alongside this. */
export function BlockedNotice() {
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-border bg-danger-soft px-4 py-2.5 text-sm text-danger-soft-fg sm:px-5"
    >
      <Ban className="size-4 shrink-0" aria-hidden="true" />
      You can&apos;t reply to this conversation.
    </div>
  );
}
