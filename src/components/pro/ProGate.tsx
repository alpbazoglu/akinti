"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Sheet } from "@/components/ui";
import { routes } from "@/config/routes";
import { BRAND } from "@/config/terminology";

import { PRO_INCLUDE_KEYS } from "./proIncludes";
import { useProStatus } from "./useProStatus";

/** Matches `Button`'s `variant="primary" size="lg"` — a real navigation to the Pro screen, not an action, so it renders as `<a>` (mirrors `ProfileHeader`'s `SECONDARY_LINK_BUTTON`). */
const PRIMARY_LINK_BUTTON =
  "akinti-press flex h-13 w-full items-center justify-center rounded-key bg-tide " +
  "type-subhead text-on-ink transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide";

export interface ProGateProps {
  open: boolean;
  onClose: () => void;
  /**
   * What specifically asked for Pro, e.g. "Pitch snap" — shown in the
   * opening line. Omitted renders a general explanation.
   */
  featureLabel?: string;
}

/**
 * The paywall moment (Wave F, PRODUCT_V2 §4/§5): a rail-hung sheet, never a
 * modal on app open. Opened from a specific gated control (a Pro-only sound
 * row today) to explain what AKINTI Pro is and link to the real Pro screen —
 * it never starts checkout itself.
 *
 * Checks the caller's own status with `useProStatus()` so an already-Pro
 * caller (e.g. one who subscribed since the page loaded) never sees an
 * upsell for something they already have.
 */
export function ProGate({ open, onClose, featureLabel }: ProGateProps) {
  const { isPro, loading } = useProStatus();
  const alreadyPro = isPro && !loading;
  const t = useTranslations("ProGate");
  const tPro = useTranslations("Pro");

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("title", { brand: BRAND })}
      description={
        alreadyPro
          ? t("alreadyHave", { brand: BRAND })
          : featureLabel
            ? t("featureIsPart", { feature: featureLabel, brand: BRAND })
            : t("isPart", { brand: BRAND })
      }
    >
      {alreadyPro ? (
        <Link href={routes.settingsPro()} className={PRIMARY_LINK_BUTTON} onClick={onClose}>
          {t("manage", { brand: BRAND })}
        </Link>
      ) : (
        <div className="flex flex-col gap-6">
          <ul className="flex flex-col gap-2">
            {PRO_INCLUDE_KEYS.map((key) => (
              <li key={key} className="type-body-sm text-ink-muted">
                {tPro(`includes.${key}`)}
              </li>
            ))}
          </ul>
          <Link href={routes.settingsPro()} className={PRIMARY_LINK_BUTTON} onClick={onClose}>
            {t("see", { brand: BRAND })}
          </Link>
        </div>
      )}
    </Sheet>
  );
}
