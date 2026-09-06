import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";

import { pickMessages } from "@/i18n/pickMessages";

/**
 * Per-route-group message narrowing (closeout perf pass), the Wave route's
 * slice — covers `/w/[id]`, `/w/[id]/duet` and `/w/[id]/duet/record` (all
 * under this one layout segment). See `../../flow/layout.tsx` for the full
 * rationale and caveats (self-sufficient list, AppShell chrome unaffected).
 * Namespaces verified by walking the real import graph from every page/
 * actions file under this directory, including through dynamically-imported
 * children (`ShareSheet`, `ReportCommentSheet`) and the Duet record flow's
 * reuse of Create's capture/review/enhance stages and AKINTI Pro sounds.
 */
const WAVE_MESSAGE_NAMESPACES = [
  "Terms",
  "Common",
  "WavePage",
  "WaveDetail",
  "WaveOwnerMenu",
  "WavePlayer",
  "WaveCard",
  "WaveCardContainer",
  "WaveActions",
  "ProcessingBanner",
  "ProcessingErrors",
  "PitchReport",
  "InstallHint",
  "CommentsSection",
  "CommentComposer",
  "CommentItem",
  "ReportCommentSheet",
  "ShareSheet",
  "Sheet",
  "DuetRequestPage",
  "DuetRequestForm",
  "DuetModePicker",
  "DuetRecordPage",
  "DuetRecorder",
  "AtismaTurnRecorder",
  "RecordStage",
  "ReviewStage",
  "EnhanceStage",
  "EnhancementPicker",
  "EnhancementPresets",
  "ProEnhancementPresets",
  "MicPermission",
  "Countdown",
  "Readouts",
  "TrimTrace",
  "PublishProgress",
  "Pro",
  "ProMark",
  "ProGate",
  "SettingsProActions",
  "MessagesActions",
  "ErrorPage",
  "NotFoundPage",
] as const;

export default async function WaveLayout({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={pickMessages(messages, WAVE_MESSAGE_NAMESPACES)}>
      {children}
    </NextIntlClientProvider>
  );
}
