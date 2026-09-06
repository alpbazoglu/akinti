import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";

import { pickMessages } from "@/i18n/pickMessages";

/**
 * Per-route-group message narrowing (closeout perf pass), Create's slice —
 * see `../flow/layout.tsx` for the full rationale and caveats
 * (self-sufficient list, AppShell chrome unaffected). Namespaces verified by
 * walking the real import graph from `page.tsx`/`actions.ts`/`duetActions.ts`,
 * including through `CreateFlow.tsx`'s dynamically-imported Review/Enhance
 * stages and the AKINTI Pro sounds gate on the enhancement picker.
 */
const CREATE_MESSAGE_NAMESPACES = [
  "Terms",
  "Common",
  "CreateFlow",
  "CreateWaveForm",
  "RecordStage",
  "ReviewStage",
  "EnhanceStage",
  "EnhancementPicker",
  "EnhancementPresets",
  "ProEnhancementPresets",
  "MicPermission",
  "Countdown",
  "Readouts",
  "TakeStrip",
  "TrimTrace",
  "PitchReport",
  "UploadDropzone",
  "PublishProgress",
  "Pro",
  "ProGate",
  "SettingsProActions",
  "ChallengesActions",
  "Sheet",
  "ErrorPage",
  "NotFoundPage",
  // `CreateFlow` now calls `useActionToast` on a successful publish, which
  // reads "Layout" (previously unneeded here: only `AppShell` chrome
  // outside this provider used it).
  "Layout",
] as const;

export default async function CreateLayout({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={pickMessages(messages, CREATE_MESSAGE_NAMESPACES)}>
      {children}
    </NextIntlClientProvider>
  );
}
