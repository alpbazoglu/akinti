"use client";

import { useTranslations } from "next-intl";

import { useCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/ui";
import { Avatar } from "@/components/ui";
import { SIGNATURE_HUES, type SignatureHue } from "@/types/domain";

export interface AppearancePreviewProps {
  /** Server-resolved value for this request — the fallback before the client auth context (`useCurrentUser`) has hydrated, and the value used at all once it has, since that context IS the live source `AppearanceForm`'s `refreshProfile()` updates on save. */
  initialSignatureHue: SignatureHue | null;
}

const HUE_CLASS: Record<SignatureHue, string> = {
  current: "bg-hue-current",
  "genre-turku": "bg-hue-genre-turku",
  "genre-rap": "bg-hue-genre-rap",
  "genre-arabesk": "bg-hue-genre-arabesk",
};

/** A short, deterministic bar-height pattern — decorative only, not real peak data (this is a settings preview, not a Wave). */
const BAR_HEIGHTS = [40, 70, 55, 90, 60, 100, 45, 80, 65, 95, 50, 75, 85, 60, 40, 70];

/**
 * "Appearance shows the theme and signature hue with live preview swatches"
 * (`DESIGN_V3_DESKTOP.md`). Theme mode is already live for the whole page —
 * `AppearanceForm` calls `router.refresh()` on change, and this preview sits
 * on the very page that refresh re-renders. Signature hue is not otherwise
 * visible anywhere else on this screen, so this mirrors it as a small trace
 * mock plus a swatch row, reading it live through `useCurrentUser()` (the
 * same context `AppearanceForm`'s `refreshProfile()` already updates on
 * save) rather than needing any new prop or callback on that form.
 */
export function AppearancePreview({ initialSignatureHue }: AppearancePreviewProps) {
  const t = useTranslations("AppearancePreview");
  const { profile } = useCurrentUser();
  const activeHue = profile ? profile.signatureHue : initialSignatureHue;
  const traceClass = activeHue ? HUE_CLASS[activeHue] : "bg-hue-current";

  return (
    <div className="flex flex-col gap-4 rounded-card border border-hairline bg-elevation-2 p-5">
      <p className="type-caption text-ink-subtle">{t("livePreviewLabel")}</p>

      <div className="flex items-center gap-3">
        <Avatar name={profile?.displayName ?? profile?.username ?? "?"} src={profile?.avatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <p className="type-body-sm truncate font-medium text-ink">
            {profile?.displayName ?? profile?.username ?? t("previewFallbackName")}
          </p>
          <p className="type-caption truncate text-ink-subtle">@{profile?.username ?? "you"}</p>
        </div>
      </div>

      <div className="flex h-10 items-end gap-[3px]" role="img" aria-label={t("livePreviewLabel")}>
        {BAR_HEIGHTS.map((height, index) => (
          <span
            key={index}
            className={cn("w-full min-w-[2px] rounded-line", index < 5 ? traceClass : "bg-hairline-strong")}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <span
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-elevation-2",
            activeHue === null ? "bg-hue-current ring-tide" : "bg-hue-current ring-transparent",
          )}
        />
        {SIGNATURE_HUES.map((hue) => (
          <span
            key={hue}
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-elevation-2",
              HUE_CLASS[hue],
              activeHue === hue ? "ring-tide" : "ring-transparent",
            )}
          />
        ))}
      </div>
    </div>
  );
}
