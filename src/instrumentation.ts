/**
 * Runs once when the Next.js server starts (`next dev` / `next start`) —
 * never during `next build`. See
 * `node_modules/next/dist/docs/01-app/02-guides/instrumentation.md`.
 *
 * Only job here today: validate required Supabase env vars are present at
 * boot (`scripts/check-env.ts#assertWebEnvAtBoot`). That check already knows
 * the difference between "not configured yet" (warn — the app is designed to
 * degrade, see `docs/SECURITY.md`) and "a real production boot with no
 * backend" (throw, refusing to serve traffic half-configured). Guarded to
 * the Node.js runtime only — the Edge runtime has no `process.env` parity
 * with the server env and doesn't need this check twice.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertWebEnvAtBoot } = await import("../scripts/check-env");
    assertWebEnvAtBoot();
  }
}
