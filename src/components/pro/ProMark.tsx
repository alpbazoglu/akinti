"use client";

import { useTranslations } from "next-intl";
import { SealCheck } from "@/components/ui/icons";
import { BRAND } from "@/config/terminology";
import { cn } from "@/lib/ui";

export interface ProMarkProps {
  className?: string;
}

/**
 * The AKINTI Pro mark (Wave F, PRODUCT_V2 §5): a Phosphor glyph plus the word
 * "Pro", ink only. Not a badge chip — no fill, no pill, no coloured
 * background (DESIGN.md §12.4/§12.28) — so it reads as a fact printed next
 * to the handle, the same register as `@username` beside it, not a
 * decoration. Signal stays exclusive to live audio (COLOR_V2 principle 2),
 * so this never borrows that hue either.
 *
 * Only ever rendered when the caller has already confirmed `isPro` — this
 * component has no opinion on entitlement, it only draws the mark.
 */
export function ProMark({ className }: ProMarkProps) {
  const t = useTranslations("ProMark");

  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1 text-ink-subtle", className)}
      title={t("title", { brand: BRAND })}
    >
      <SealCheck aria-hidden="true" weight="regular" className="size-3.5" />
      <span className="type-caption">{t("label")}</span>
    </span>
  );
}
