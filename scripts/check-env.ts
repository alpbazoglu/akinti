/**
 * AKINTI environment validation.
 *
 * Two contexts, because the two processes need different things:
 *
 *  - "web"    — the Next.js app. `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
 *    only. The app is designed to degrade to an honest "backend not configured"
 *    UI when these are absent (`isSupabaseConfigured()`,
 *    `src/lib/supabase/config.ts` — see `docs/SECURITY.md` "Never a fake
 *    login"), so a missing key is a loud warning, not a crash, EXCEPT in a
 *    real production boot (`NODE_ENV=production`, and either running on
 *    Vercel or `REQUIRE_SUPABASE=1` was set deliberately) — there, a silently
 *    unconfigured backend is exactly the "fake success" spec rule 9 forbids,
 *    so it fails loudly instead.
 *  - "worker" — `scripts/worker.ts`. It cannot do anything useful without a
 *    live Supabase project (`createAdminClient()` needs the URL, and
 *    `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS for job claiming — see
 *    `src/lib/supabase/admin.ts`), so a missing variable is always a hard
 *    failure, in every environment.
 *
 * Used from three places:
 *  1. `npm run check-env` / `npm run check-env:worker` — a manual sanity
 *     check for `.env.local` before `npm run dev` / `npm run worker`.
 *  2. `src/instrumentation.ts` — calls `assertWebEnvAtBoot()` once when the
 *     Next.js server starts (see "Instrumentation" in Next's docs — this
 *     never runs during `next build`, only at `next dev`/`next start` boot).
 *  3. `Dockerfile.worker`'s entrypoint — calls this script with `--worker`
 *     before starting the worker loop, so a missing secret fails the
 *     container immediately with a clear message instead of an obscure crash
 *     on the first claimed job.
 */

const WEB_REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

const WORKER_REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export type EnvContext = "web" | "worker";

export interface EnvCheckResult {
  context: EnvContext;
  required: readonly string[];
  missing: readonly string[];
  ok: boolean;
}

function isSet(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

export function checkEnv(context: EnvContext): EnvCheckResult {
  const required = context === "worker" ? WORKER_REQUIRED : WEB_REQUIRED;
  const missing = required.filter((name) => !isSet(name));
  return { context, required, missing, ok: missing.length === 0 };
}

function formatMissing(result: EnvCheckResult): string {
  const lines = [
    `[check-env] Missing required environment variable(s) for the ${result.context} context:`,
    ...result.missing.map((name) => `  - ${name}`),
    "See .env.example for the full list, and docs/DEPLOYMENT.md for where each value comes from.",
  ];
  return lines.join("\n");
}

/**
 * True when a missing Supabase key must be treated as a hard failure for the
 * web app: a real production boot, not a preview/dev/CI build with no
 * backend configured yet.
 */
export function requiresSupabaseAtBoot(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    (Boolean(process.env.VERCEL) || process.env.REQUIRE_SUPABASE === "1")
  );
}

/**
 * Called once from `src/instrumentation.ts#register()` at server startup.
 * Never called during `next build`. Warns in dev/unconfigured-production
 * (the app degrades on its own — see `isSupabaseConfigured()`), throws when
 * `requiresSupabaseAtBoot()` is true so a real deployment never silently
 * boots half-configured.
 */
export function assertWebEnvAtBoot(): void {
  const result = checkEnv("web");
  if (result.ok) {
    return;
  }

  const message = formatMissing(result);
  if (requiresSupabaseAtBoot()) {
    console.error(message);
    throw new Error(
      `check-env: refusing to boot in production without ${result.missing.join(", ")}`,
    );
  }

  console.warn(message);
}

/* ------------------------------------------------------------------------ */
/* CLI                                                                       */
/* ------------------------------------------------------------------------ */

function isMainModule(): boolean {
  const entry = process.argv[1] ?? "";
  return entry.endsWith("check-env.ts") || entry.endsWith("check-env.js");
}

function runCli(): void {
  const context: EnvContext = process.argv.includes("--worker") ? "worker" : "web";
  const result = checkEnv(context);

  if (result.ok) {
    console.log(`[check-env] ${context}: all required environment variables are set.`);
    return;
  }

  console.error(formatMissing(result));
  process.exit(1);
}

if (isMainModule()) {
  runCli();
}
