/**
 * The app's own origin, resolved server-side — never taken from client
 * input. Used anywhere a redirect/callback URL must point back at this
 * deployment (see `src/app/(app)/settings/pro/actions.ts`'s `startProCheckout`,
 * review3 finding 17: an unvalidated client-supplied `returnUrl` becomes
 * iyzico's `callbackUrl`/Paddle's `checkout.url`, an open-redirect surface).
 *
 * Resolution order: `NEXT_PUBLIC_SITE_URL` (set it in production — see
 * `.env.example`/`docs/DEPLOYMENT.md`) → Vercel's own `VERCEL_URL` (set
 * automatically on every deployment, no `https://` prefix) → localhost, for
 * `npm run dev`.
 */
export function siteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}
