"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { setLocale } from "@/app/(app)/settings/actions";
import { Sheet, useToast } from "@/components/ui";
import { Check, ChevronRight } from "@/components/ui/icons";
import type { AppLocale } from "@/i18n/locale";
import { LOCALES } from "@/i18n/locale";

/** Language names are endonyms — a language always names itself in itself, never translated. */
const LANGUAGE_NAME: Readonly<Record<AppLocale, string>> = {
  tr: "Türkçe",
  en: "English",
};

/**
 * Settings hub → language row (i18n infrastructure). A destination-style row
 * matching every other `SettingsPage` row (label, current value, chevron),
 * opening a Sheet with the two languages as a flat list — the same shape
 * `DeleteAccountSheet` uses rather than a new segmented-control primitive
 * DESIGN.md doesn't otherwise call for.
 */
export function LanguageSwitchRow() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Settings");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function choose(next: AppLocale) {
    if (next === locale) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const result = await setLocale(next);
      setOpen(false);
      if (!result.ok) {
        toast({ title: result.formError ?? t("languageError"), tone: "error" });
        return;
      }
      toast({ title: result.message ?? t("languageUpdated"), tone: "success" });
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 border-b border-hairline py-3.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
      >
        <span className="type-body block flex-1 text-ink">{t("language")}</span>
        <span className="type-caption text-ink-subtle">{LANGUAGE_NAME[locale]}</span>
        <ChevronRight className="size-3 shrink-0 text-ink-subtle" aria-hidden="true" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={t("languageSheetTitle")}>
        <div className="flex flex-col">
          {LOCALES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => choose(option)}
              disabled={isPending}
              className="flex items-center justify-between border-b border-hairline py-3.5 text-left type-body text-ink last:border-b-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
            >
              {LANGUAGE_NAME[option]}
              {option === locale ? <Check className="size-4 text-tide" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
