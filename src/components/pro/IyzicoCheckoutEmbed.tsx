"use client";

import { useEffect, useRef } from "react";

export interface IyzicoCheckoutEmbedProps {
  /** iyzico's `checkoutFormContent` (HTML + `<script>`) from `startProCheckout` — see `docs/BILLING.md` "Checkout flow — iyzico". */
  checkoutFormContent: string;
}

/**
 * Mounts iyzico's Subscription Checkout Form per its own embed contract: a
 * `<div id="iyzipay-checkout-form">` holding the HTML iyzico returned.
 *
 * A script tag written via `innerHTML` never executes (a browser security
 * rule, not a bug) — `checkoutFormContent`'s own `<script>` is what actually
 * draws iyzico's payment fields into this div, so it is re-created as a real
 * `<script>` element after the markup is in the DOM, the standard way to run
 * third-party embed HTML that arrives as a string.
 */
export function IyzicoCheckoutEmbed({ checkoutFormContent }: IyzicoCheckoutEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = checkoutFormContent;

    const inertScripts = Array.from(container.querySelectorAll("script"));
    for (const inertScript of inertScripts) {
      const liveScript = document.createElement("script");
      for (const attribute of Array.from(inertScript.attributes)) {
        liveScript.setAttribute(attribute.name, attribute.value);
      }
      liveScript.textContent = inertScript.textContent;
      inertScript.replaceWith(liveScript);
    }

    return () => {
      container.innerHTML = "";
    };
  }, [checkoutFormContent]);

  return <div id="iyzipay-checkout-form" ref={containerRef} className="min-h-96 w-full" />;
}
