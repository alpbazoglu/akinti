/**
 * Pure, unit-testable formatting for the messaging UI (spec §22): the
 * conversation-list preview line (varies by message `kind`), day separators
 * for the thread view, bubble timestamps and consecutive-bubble grouping.
 * Kept free of React/Supabase so the rules live in one tested place.
 */
import { TERMS } from "@/config/terminology";
import type { Message } from "@/types/domain";

const PREVIEW_MAX_LENGTH = 80;

/**
 * One-line inbox preview for a conversation's last message, varying by kind
 * (spec §22 deliverable 1: "text / 🎙 Audio message / Wave shared / Duet
 * Request"). `null` covers a brand-new conversation with no messages yet.
 */
export function formatMessagePreview(message: Message | null, viewerId: string): string {
  if (!message) {
    return "No messages yet";
  }

  const prefix = message.senderId === viewerId ? "You: " : "";

  switch (message.kind) {
    case "text": {
      const body = (message.body ?? "").trim();
      if (body.length === 0) {
        return `${prefix}Message`;
      }
      const truncated =
        body.length > PREVIEW_MAX_LENGTH ? `${body.slice(0, PREVIEW_MAX_LENGTH - 1)}…` : body;
      return `${prefix}${truncated}`;
    }
    case "audio":
      return `${prefix}\u{1F3A4} Audio message`;
    case "wave_share":
      return `${prefix}${TERMS.wave} shared`;
    case "duet_request":
      return `${prefix}${TERMS.duetRequest}`;
    default:
      return `${prefix}Message`;
  }
}

export interface DayGroup {
  readonly key: string;
  readonly label: string;
  readonly messages: readonly Message[];
}

function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) {
    return date.toLocaleDateString("en", { weekday: "long" });
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(
    "en",
    sameYear ? { month: "long", day: "numeric" } : { month: "long", day: "numeric", year: "numeric" },
  );
}

/**
 * Groups messages (any order in, ascending order out) into day buckets with
 * a human day-separator label ("Today" / "Yesterday" / weekday / full date).
 */
export function groupMessagesByDay(messages: readonly Message[], now: Date = new Date()): DayGroup[] {
  const sorted = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const groups: DayGroup[] = [];

  for (const message of sorted) {
    const key = dayKey(message.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      (last.messages as Message[]).push(message);
    } else {
      groups.push({ key, label: dayLabel(message.createdAt, now), messages: [message] });
    }
  }

  return groups;
}

/** Short time for a bubble timestamp, e.g. "2:45 PM". */
export function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
}

/** Default max gap between two consecutive messages that still visually group under one avatar/timestamp. */
export const GROUP_GAP_MS = 5 * 60_000;

/**
 * True when `current` should render grouped with `previous` (no repeated
 * avatar/name, tighter spacing): same sender, no other sender in between,
 * within `maxGapMs` of each other.
 */
export function shouldGroupWithPrevious(
  current: Message,
  previous: Message | null,
  maxGapMs: number = GROUP_GAP_MS,
): boolean {
  if (!previous) return false;
  if (previous.senderId !== current.senderId) return false;
  const gap = new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime();
  return gap >= 0 && gap <= maxGapMs;
}
