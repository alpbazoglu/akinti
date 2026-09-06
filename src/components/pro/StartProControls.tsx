"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { startProCheckout } from "@/app/(app)/settings/pro/actions";
import { Button, Input, Sheet } from "@/components/ui";
import type { IyzicoBuyerDetails } from "@/lib/billing/types";
import { cn } from "@/lib/ui";

import { IyzicoCheckoutEmbed } from "./IyzicoCheckoutEmbed";
import { PRO_INCLUDE_KEYS } from "./proIncludes";
import {
  detectProCurrency,
  formatProPrice,
  hasSeededYearlyPlan,
  planCodeFor,
  resolvePlanAmount,
  type ProCurrency,
  type ProInterval,
  type ProPlanSummary,
} from "./pricing";

export interface StartProControlsProps {
  plans: readonly ProPlanSummary[];
  /** `null` means `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` isn't set — a USD/international caller then sees an honest "not set up yet" state instead of a broken Start Pro key. */
  paddleClientToken: string | null;
  paddleEnvironment: "sandbox" | "production";
  /** `IYZICO_API_KEY`/`IYZICO_SECRET_KEY` are both set — the TRY-side equivalent of `paddleClientToken !== null` (QA `full2` defect #2). */
  iyzicoReady: boolean;
  /** The request's resolved locale (`getLocale()`), threaded down from `settings/pro/page.tsx` -> `ProScreen` -> here (review3 finding 27) — determines the checkout currency (`detectProCurrency`), not `navigator.language` alone. */
  locale: string;
}

/** Line key look (§8.7): active is an ink key, inactive a hairline key — never a segmented pill (§12.4). */
function IntervalKey({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "akinti-press h-10 flex-1 rounded-key type-subhead transition-colors duration-[--dur-micro]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide",
        active ? "bg-ink text-on-ink" : "border border-hairline-strong text-ink",
      )}
    >
      {label}
    </button>
  );
}

/**
 * Desktop-only (`DESIGN_V3_DESKTOP.md`: "Pro screen gets the card-row plan
 * picker on desktop") replacement for the two `IntervalKey` line keys above —
 * same `billingInterval` state, same click handler, just shown as a real
 * priced card instead of a segmented line key, the way a subscription
 * picker reads everywhere else on the web. Mobile keeps the line keys
 * untouched (`lg:hidden` on that group below); this is `hidden lg:grid`.
 */
function PlanCard({
  active,
  label,
  amount,
  unit,
  currency,
  badge,
  onClick,
}: {
  active: boolean;
  label: string;
  amount: number | null;
  unit: string;
  currency: ProCurrency;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "akinti-press flex flex-col items-start gap-2 rounded-card border p-5 text-left transition-[border-color,background-color,box-shadow] duration-[--dur-quick]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide",
        active
          ? "border-tide bg-elevation-2 shadow-lift"
          : "border-hairline-strong bg-elevation-1 hover:bg-elevation-2",
      )}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className={cn("type-subhead", active ? "text-tide" : "text-ink")}>{label}</span>
        {badge ? (
          <span className="type-caption rounded-tag border border-sand-deep bg-sand/10 px-2 py-0.5 font-medium text-sand-deep">
            {badge}
          </span>
        ) : null}
      </span>
      {amount !== null ? (
        <span className="flex items-baseline gap-1.5">
          <span className="type-mono-lg tabular-nums text-ink">{formatProPrice(amount, currency)}</span>
          <span className="type-body-sm text-ink-subtle">/{unit}</span>
        </span>
      ) : null}
    </button>
  );
}

const EMPTY_BUYER: IyzicoBuyerDetails = {
  identityNumber: "",
  gsmNumber: "",
  address: "",
  city: "",
  country: "Turkey",
  zipCode: "",
};

/**
 * The not-subscribed state (Wave F, PRODUCT_V2 §4/§5): what Pro includes,
 * monthly/yearly, the price in the caller's currency, and the one primary
 * "Start Pro" key. Owns the whole checkout hand-off: iyzico's buyer-details
 * Sheet then its embedded Checkout Form for a TRY plan, Paddle's own
 * checkout overlay for a USD plan.
 */
export function StartProControls({ plans, paddleClientToken, paddleEnvironment, iyzicoReady, locale }: StartProControlsProps) {
  const t = useTranslations("StartProControls");
  const tPro = useTranslations("Pro");
  const [billingInterval, setBillingInterval] = useState<ProInterval>("month");
  const currency = detectProCurrency(locale);
  const [buyerOpen, setBuyerOpen] = useState(false);
  const [buyer, setBuyer] = useState<IyzicoBuyerDetails>(EMPTY_BUYER);
  const [buyerErrors, setBuyerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [checkoutFormContent, setCheckoutFormContent] = useState<string | null>(null);

  const showYearly = hasSeededYearlyPlan(plans, currency);
  const amount = resolvePlanAmount(plans, currency, billingInterval);
  const monthlyAmount = resolvePlanAmount(plans, currency, "month");
  const yearlyAmount = showYearly ? resolvePlanAmount(plans, currency, "year") : null;
  // A whole-number "save N%" only when it's a real discount, never "save 0%".
  const yearlySavingsPercent =
    yearlyAmount !== null && monthlyAmount !== null && monthlyAmount > 0
      ? Math.round((1 - yearlyAmount / (monthlyAmount * 12)) * 100)
      : 0;
  const planCode = planCodeFor(currency, billingInterval);
  const paddleReady = Boolean(paddleClientToken);
  // QA `full2` defect #2: check the plan exists AND the provider is
  // configured before ever asking for a Turkish national ID — mirrors the
  // USD/Paddle `paddleReady` gate below, which already worked this way.
  const tryPlanSeeded = plans.some((plan) => plan.currency === "TRY");
  const iyzicoUnavailable = currency === "TRY" && (!iyzicoReady || !tryPlanSeeded);

  if (checkoutFormContent) {
    return (
      <div className="flex flex-col gap-4">
        <p className="type-body-sm text-ink-muted">{t("completePayment")}</p>
        <IyzicoCheckoutEmbed checkoutFormContent={checkoutFormContent} />
      </div>
    );
  }

  const startCheckout = async (withBuyer?: IyzicoBuyerDetails) => {
    setStarting(true);
    setFormError(null);
    const result = await startProCheckout({
      planCode,
      buyer: withBuyer,
    });
    setStarting(false);

    if (!result.ok) {
      if (result.fieldErrors?.buyer) {
        setBuyerErrors({ identityNumber: result.fieldErrors.buyer });
      }
      setFormError(result.formError ?? t("couldNotStartCheckout"));
      return;
    }

    if (result.data?.checkoutFormContent) {
      setBuyerOpen(false);
      setCheckoutFormContent(result.data.checkoutFormContent);
      return;
    }

    if (result.data?.transactionId) {
      setBuyerOpen(false);
      // `@paddle/paddle-js` only ever loads on this route, on demand — never
      // bundled into a route that doesn't sell anything.
      const { initializePaddle } = await import("@paddle/paddle-js");
      const paddle = await initializePaddle({
        token: paddleClientToken ?? "",
        environment: paddleEnvironment,
      });
      if (!paddle) {
        setFormError(t("couldNotOpenPaymentWindow"));
        return;
      }
      paddle.Checkout.open({ transactionId: result.data.transactionId });
      return;
    }

    if (result.data?.redirectUrl) {
      window.location.assign(result.data.redirectUrl);
    }
  };

  const handleStartPro = () => {
    // Unreachable in practice — the button below is replaced by the
    // "not set up" message whenever `iyzicoUnavailable` is true — but kept
    // as a guard so a TRY checkout can never open the buyer-details Sheet
    // (and ask for a national ID) without a real plan and provider behind it.
    if (iyzicoUnavailable) return;
    if (currency === "TRY") {
      setBuyerOpen(true);
      return;
    }
    void startCheckout();
  };

  const handleBuyerSubmit = () => {
    void startCheckout(buyer);
  };

  return (
    <div className="flex flex-col gap-8">
      <ul className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-2">
        {PRO_INCLUDE_KEYS.map((key) => (
          <li key={key} className="type-body-sm text-ink-muted">
            {tPro(`includes.${key}`)}
          </li>
        ))}
      </ul>

      {showYearly ? (
        <>
          {/* Mobile/tablet: the plain line-key toggle, unchanged. */}
          <div role="group" aria-label={t("billingIntervalLabel")} className="flex gap-3 lg:hidden">
            <IntervalKey active={billingInterval === "month"} label={t("monthly")} onClick={() => setBillingInterval("month")} />
            <IntervalKey active={billingInterval === "year"} label={t("yearly")} onClick={() => setBillingInterval("year")} />
          </div>

          {/* Desktop: the card-row plan picker (`DESIGN_V3_DESKTOP.md`) —
              same state, same handlers, just a priced card instead of a
              segmented line key. */}
          <div role="group" aria-label={t("billingIntervalLabel")} className="hidden lg:grid lg:grid-cols-2 lg:gap-4">
            <PlanCard
              active={billingInterval === "month"}
              label={t("monthly")}
              amount={monthlyAmount}
              unit={t("monthUnit")}
              currency={currency}
              onClick={() => setBillingInterval("month")}
            />
            <PlanCard
              active={billingInterval === "year"}
              label={t("yearly")}
              amount={yearlyAmount}
              unit={t("yearUnit")}
              currency={currency}
              badge={yearlySavingsPercent > 0 ? t("savePercent", { percent: yearlySavingsPercent }) : undefined}
              onClick={() => setBillingInterval("year")}
            />
          </div>
        </>
      ) : null}

      {amount !== null ? (
        <p className={cn("flex items-baseline gap-2", showYearly && "lg:hidden")}>
          <span className="type-mono-lg tabular-nums text-ink">{formatProPrice(amount, currency)}</span>
          <span className="type-body-sm text-ink-subtle">/{billingInterval === "month" ? t("monthUnit") : t("yearUnit")}</span>
        </p>
      ) : null}

      {(currency === "USD" && !paddleReady) || iyzicoUnavailable ? (
        <p className="type-body-sm text-ink-muted">{t("paymentsNotSetUp")}</p>
      ) : (
        <Button size="lg" fullWidth onClick={handleStartPro} loading={starting}>
          {t("startPro")}
        </Button>
      )}

      {formError && !buyerOpen ? (
        <p role="alert" className="type-body-sm text-danger">
          {formError}
        </p>
      ) : null}

      <Sheet
        open={buyerOpen}
        onClose={() => {
          if (starting) return;
          setBuyerOpen(false);
        }}
        title={t("billingDetailsTitle")}
        description={t("billingDetailsDescription")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBuyerOpen(false)} disabled={starting}>
              {t("back")}
            </Button>
            <Button onClick={handleBuyerSubmit} loading={starting}>
              {t("continueToPayment")}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            id="pro-buyer-identity"
            label={t("identityNumberLabel")}
            value={buyer.identityNumber}
            onChange={(event) => setBuyer({ ...buyer, identityNumber: event.target.value })}
            error={buyerErrors.identityNumber}
            inputMode="numeric"
          />
          <Input
            id="pro-buyer-phone"
            label={t("phoneNumberLabel")}
            value={buyer.gsmNumber}
            onChange={(event) => setBuyer({ ...buyer, gsmNumber: event.target.value })}
            type="tel"
          />
          <Input
            id="pro-buyer-address"
            label={t("addressLabel")}
            value={buyer.address}
            onChange={(event) => setBuyer({ ...buyer, address: event.target.value })}
          />
          <Input
            id="pro-buyer-city"
            label={t("cityLabel")}
            value={buyer.city}
            onChange={(event) => setBuyer({ ...buyer, city: event.target.value })}
          />
          <Input
            id="pro-buyer-country"
            label={t("countryLabel")}
            value={buyer.country}
            onChange={(event) => setBuyer({ ...buyer, country: event.target.value })}
          />
          <Input
            id="pro-buyer-zip"
            label={t("postalCodeLabel")}
            hint={t("optional")}
            value={buyer.zipCode ?? ""}
            onChange={(event) => setBuyer({ ...buyer, zipCode: event.target.value })}
          />
          {formError ? (
            <p role="alert" className="type-body-sm text-danger">
              {formError}
            </p>
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}
