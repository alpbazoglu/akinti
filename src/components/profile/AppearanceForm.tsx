"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setThemeMode, updateAppearance } from "@/app/(app)/settings/actions";
import { useCurrentUser } from "@/lib/auth";
import { SIGNATURE_HUES, type SignatureHue } from "@/types/domain";
import { useToast } from "@/components/ui";
import { Check } from "@/components/ui/icons";
import { cn } from "@/lib/ui";
import { THEME_MODES, type ThemeMode } from "@/lib/ui/themeMode";

export interface AppearanceFormProps {
  initialThemeMode: ThemeMode;
  initialSignatureHue: SignatureHue | null;
}

const THEME_MODE_KEY: Record<ThemeMode, "themeSystem" | "themeLight" | "themeDark"> = {
  system: "themeSystem",
  light: "themeLight",
  dark: "themeDark",
};

const SIGNATURE_HUE_KEY: Record<SignatureHue, "hueCurrent" | "hueReedGreen" | "hueDeepWaterBlue" | "hueSand"> = {
  current: "hueCurrent",
  "genre-turku": "hueReedGreen",
  "genre-rap": "hueDeepWaterBlue",
  "genre-arabesk": "hueSand",
};

/**
 * Settings → Appearance (COLOR_V2, QA `full2` defect #1's fix): theme mode
 * (system/light/dark, `data-theme` on `<html>`, `src/app/layout.tsx`) plus
 * an optional signature hue picked from the four fixed COLOR_V2 tints —
 * never an open colour field, no gradients, no violet/plum, no cards
 * (DESIGN.md §12): two rail-hung radiogroups, hairline-separated rows only.
 * "Automatic" (`null`) leaves the signature trace to fall back to a
 * tag-derived genre hue, same as before this feature existed
 * (`deriveGenreHue`, `@/components/feed`).
 */
export function AppearanceForm({ initialThemeMode, initialSignatureHue }: AppearanceFormProps) {
  const router = useRouter();
  const { refreshProfile } = useCurrentUser();
  const { toast } = useToast();
  const t = useTranslations("AppearanceForm");
  const [themeMode, setThemeModeState] = useState(initialThemeMode);
  const [signatureHue, setSignatureHue] = useState(initialSignatureHue);
  const [themePending, startThemeTransition] = useTransition();
  const [huePending, startHueTransition] = useTransition();

  function handleThemeChange(next: ThemeMode) {
    if (next === themeMode) return;
    const previous = themeMode;
    setThemeModeState(next);
    startThemeTransition(async () => {
      const result = await setThemeMode(next);
      if (!result.ok) {
        setThemeModeState(previous);
        toast({ title: result.formError ?? t("saveErrorDefault"), tone: "error" });
        return;
      }
      // The `data-theme` attribute is set server-side in the root layout
      // from the cookie `setThemeMode` just wrote — refresh so this
      // request's render picks it up immediately rather than on next nav.
      router.refresh();
      toast({ title: result.message ?? t("saved"), tone: "success" });
    });
  }

  function handleHueChange(next: SignatureHue | null) {
    if (next === signatureHue) return;
    const previous = signatureHue;
    setSignatureHue(next);
    startHueTransition(async () => {
      const result = await updateAppearance({ signatureHue: next });
      if (!result.ok) {
        setSignatureHue(previous);
        toast({ title: result.formError ?? t("saveErrorDefault"), tone: "error" });
        return;
      }
      await refreshProfile();
      toast({ title: result.message ?? t("saved"), tone: "success" });
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="type-caption text-ink-subtle">{t("themeLabel")}</h2>
        <div role="radiogroup" aria-label={t("themeLabel")} className="flex flex-col">
          {THEME_MODES.map((mode) => {
            const selected = mode === themeMode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={themePending}
                onClick={() => handleThemeChange(mode)}
                className={cn(
                  "flex h-12 items-center justify-between border-t border-hairline px-1 text-left type-body text-ink last:border-b last:border-hairline",
                  "transition-colors duration-[--dur-micro]",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink",
                  selected && "bg-paper-sunk",
                )}
              >
                {t(THEME_MODE_KEY[mode])}
                {selected ? <Check className="size-4 text-tide" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="type-caption text-ink-subtle">{t("signatureHueLabel")}</h2>
        <p className="type-caption text-ink-subtle">{t("signatureHueDescription")}</p>
        <div role="radiogroup" aria-label={t("signatureHueLabel")} className="flex flex-col">
          <button
            type="button"
            role="radio"
            aria-checked={signatureHue === null}
            disabled={huePending}
            onClick={() => handleHueChange(null)}
            className={cn(
              "flex h-14 items-center gap-4 border-t border-hairline px-1 text-left",
              "transition-colors duration-[--dur-micro]",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink",
              signatureHue === null ? "bg-paper-sunk" : "hover:bg-paper-sunk/50",
            )}
          >
            <span aria-hidden="true" className="size-3 shrink-0 rounded-full border border-hairline-strong" />
            <span className="type-body flex-1 text-ink">{t("hueAutomatic")}</span>
            {signatureHue === null ? <Check className="size-4 text-tide" aria-hidden="true" /> : null}
          </button>
          {SIGNATURE_HUES.map((hue) => {
            const selected = hue === signatureHue;
            return (
              <button
                key={hue}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={huePending}
                onClick={() => handleHueChange(hue)}
                className={cn(
                  "flex h-14 items-center gap-4 border-t border-hairline px-1 text-left last:border-b last:border-hairline",
                  "transition-colors duration-[--dur-micro]",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink",
                  selected ? "bg-paper-sunk" : "hover:bg-paper-sunk/50",
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: `var(--akinti-hue-${hue})` }}
                />
                <span className="type-body flex-1 text-ink">{t(SIGNATURE_HUE_KEY[hue])}</span>
                {selected ? <Check className="size-4 text-tide" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
