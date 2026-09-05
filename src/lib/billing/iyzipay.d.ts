/**
 * Minimal ambient types for the `iyzipay` package, which ships no `.d.ts`
 * of its own (`node_modules/iyzipay/package.json` has no `"types"` field —
 * confirmed by inspecting the installed package, not assumed). Scoped to
 * exactly the surface `src/lib/billing/iyzico.ts` calls, sourced from that
 * package's own `lib/resources/*.js` and `lib/Iyzipay.js` — never guessed.
 */
declare module "iyzipay" {
  interface IyzicoAddress {
    address: string;
    contactName: string;
    city: string;
    country: string;
    zipCode?: string;
  }

  interface IyzicoCustomer {
    name: string;
    surname: string;
    email: string;
    identityNumber: string;
    gsmNumber: string;
    billingAddress: IyzicoAddress;
  }

  interface IyzicoCheckoutFormInitializeResult {
    status: "success" | "failure";
    errorMessage?: string;
    token: string;
    checkoutFormContent: string;
    tokenExpireTime?: number;
  }

  interface IyzicoCheckoutFormRetrieveResult {
    status: "success" | "failure";
    errorMessage?: string;
    data?: {
      referenceCode?: string;
      subscriptionStatus?: string;
      endDate?: number;
      pricingPlanReferenceCode?: string;
    };
  }

  interface IyzicoBasicResult {
    status: "success" | "failure";
    errorMessage?: string;
  }

  type IyzicoCallback<T> = (err: unknown, result: T) => void;

  class SubscriptionCheckoutFormResource {
    initialize(
      params: {
        locale: string;
        conversationId: string;
        callbackUrl: string;
        pricingPlanReferenceCode: string;
        subscriptionInitialStatus: string;
        customer: IyzicoCustomer;
      },
      callback: IyzicoCallback<IyzicoCheckoutFormInitializeResult>,
    ): void;
    retrieve(
      params: { checkoutFormToken: string },
      callback: IyzicoCallback<IyzicoCheckoutFormRetrieveResult>,
    ): void;
  }

  class SubscriptionResource {
    cancel(
      params: { subscriptionReferenceCode: string },
      callback: IyzicoCallback<IyzicoBasicResult>,
    ): void;
  }

  interface IyzipayConfig {
    apiKey: string;
    secretKey: string;
    uri: string;
  }

  class Iyzipay {
    constructor(config: IyzipayConfig);
    subscriptionCheckoutForm: SubscriptionCheckoutFormResource;
    subscription: SubscriptionResource;

    static LOCALE: { TR: string; EN: string };
    static SUBSCRIPTION_INITIAL_STATUS: { ACTIVE: string; PENDING: string };
  }

  export default Iyzipay;
}
