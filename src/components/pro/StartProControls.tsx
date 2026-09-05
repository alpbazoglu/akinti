"use client";

import { useState } from "react";

import { startProCheckout } from "@/app/(app)/settings/pro/actions";
import { Button, Input, Sheet } from "@/components/ui";
import type { IyzicoBuyerDetails } from "@/lib/billing/types";
import { cn } from "@/lib/ui";

import { IyzicoCheckoutEmbed } from "./IyzicoCheckoutEmbed";
import { PRO_INCLUDES } from "./proIncludes";
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
export function StartProControls({ plans, paddleClientToken, paddleEnvironment }: StartProControlsProps) {
  const [billingInterval, setBillingInterval] = useState<ProInterval>("month");
  // Detected once, client-side only (no profile locale column exists yet —
  // see `detectProCurrency`'s doc comment) — never re-derived per click.
  const [currency] = useState<ProCurrency>(() => detectProCurrency());
  const [buyerOpen, setBuyerOpen] = useState(false);
  const [buyer, setBuyer] = useState<IyzicoBuyerDetails>(EMPTY_BUYER);
  const [buyerErrors, setBuyerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [checkoutFormContent, setCheckoutFormContent] = useState<string | null>(null);

  const showYearly = hasSeededYearlyPlan(plans, currency);
  const amount = resolvePlanAmount(plans, currency, billingInterval);
  const planCode = planCodeFor(currency, billingInterval);
  const paddleReady = Boolean(paddleClientToken);

  if (checkoutFormContent) {
    return (
      <div className="flex flex-col gap-4">
        <p className="type-body-sm text-ink-muted">Complete your payment below.</p>
        <IyzicoCheckoutEmbed checkoutFormContent={checkoutFormContent} />
      </div>
    );
  }

  const startCheckout = async (withBuyer?: IyzicoBuyerDetails) => {
    setStarting(true);
    setFormError(null);
    const result = await startProCheckout({
      planCode,
      returnUrl: window.location.href,
      buyer: withBuyer,
    });
    setStarting(false);

    if (!result.ok) {
      if (result.fieldErrors?.buyer) {
        setBuyerErrors({ identityNumber: result.fieldErrors.buyer });
      }
      setFormError(result.formError ?? "We couldn't start checkout. Try again.");
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
        setFormError("We couldn't open the payment window. Try again.");
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
      <ul className="flex flex-col gap-2">
        {PRO_INCLUDES.map((item) => (
          <li key={item} className="type-body-sm text-ink-muted">
            {item}
          </li>
        ))}
      </ul>

      {showYearly ? (
        <div role="group" aria-label="Billing interval" className="flex gap-3">
          <IntervalKey active={billingInterval === "month"} label="Monthly" onClick={() => setBillingInterval("month")} />
          <IntervalKey active={billingInterval === "year"} label="Yearly" onClick={() => setBillingInterval("year")} />
        </div>
      ) : null}

      {amount !== null ? (
        <p className="flex items-baseline gap-2">
          <span className="type-mono-lg tabular-nums text-ink">{formatProPrice(amount, currency)}</span>
          <span className="type-body-sm text-ink-subtle">/{billingInterval === "month" ? "month" : "year"}</span>
        </p>
      ) : null}

      {currency === "USD" && !paddleReady ? (
        <p className="type-body-sm text-ink-muted">Payments are not set up yet. Check back soon.</p>
      ) : (
        <Button size="lg" fullWidth onClick={handleStartPro} loading={starting}>
          Start Pro
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
        title="Billing details"
        description="iyzico needs these to process a Turkish Lira payment."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBuyerOpen(false)} disabled={starting}>
              Back
            </Button>
            <Button onClick={handleBuyerSubmit} loading={starting}>
              Continue to payment
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            id="pro-buyer-identity"
            label="Turkish identity number"
            value={buyer.identityNumber}
            onChange={(event) => setBuyer({ ...buyer, identityNumber: event.target.value })}
            error={buyerErrors.identityNumber}
            inputMode="numeric"
          />
          <Input
            id="pro-buyer-phone"
            label="Phone number"
            value={buyer.gsmNumber}
            onChange={(event) => setBuyer({ ...buyer, gsmNumber: event.target.value })}
            type="tel"
          />
          <Input
            id="pro-buyer-address"
            label="Address"
            value={buyer.address}
            onChange={(event) => setBuyer({ ...buyer, address: event.target.value })}
          />
          <Input
            id="pro-buyer-city"
            label="City"
            value={buyer.city}
            onChange={(event) => setBuyer({ ...buyer, city: event.target.value })}
          />
          <Input
            id="pro-buyer-country"
            label="Country"
            value={buyer.country}
            onChange={(event) => setBuyer({ ...buyer, country: event.target.value })}
          />
          <Input
            id="pro-buyer-zip"
            label="Postal code"
            hint="Optional"
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
