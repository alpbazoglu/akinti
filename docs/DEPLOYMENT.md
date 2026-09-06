# AKINTI — Deployment

Three independent pieces to deploy: the **web app** (Vercel), the
**database/storage/auth backend** (Supabase), and the **audio worker** (any
long-running Docker host — deliberately *not* Vercel; see
[`AUDIO_ARCHITECTURE.md`](AUDIO_ARCHITECTURE.md#background-job-queue--the-chosen-design)).
Do them in this order — the worker and the web app both need a Supabase
project to already exist.

## 1. Supabase setup

**Create the project.** A free-tier project is enough to start.

**Apply migrations, in filename order.** `supabase/migrations/*.sql` are
timestamped so that order is unambiguous — never skip or reorder one; later
migrations close FKs and fix security issues that earlier ones leave open on
purpose (see the file-by-file table in [`DATABASE.md`](DATABASE.md)).

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

No CLI access? Open the Studio SQL editor and paste/run each file under
`supabase/migrations/` in order instead. Full detail, including the local
`supabase start`/`db reset` path once Docker is available:
[`supabase/README.md`](../supabase/README.md).

**No CLI/Docker, but `psql`/Node is available?** Use
`scripts/apply-migrations.ts` — a small `pg`-based runner that needs only a
`DATABASE_URL` (see below for how to get it), no CLI login/link step:

```bash
npm run db:migrate:dry   # list pending migrations; no DB connection required
npm run db:migrate       # apply every pending migration (skips ones already applied)
```

It tracks applied migrations in `public.schema_migrations`, runs each file
in its own transaction, and stops with a non-zero exit on the first failure
(`FAILED <name>: <error> at position <n>`). See
[`supabase/README.md`](../supabase/README.md#option-d--scriptsapply-migrationsts-plain-pg-no-clidocker)
for `--down` (single-migration rollback) and other detail.

**Getting `DATABASE_URL`.** Supabase dashboard → **Project Settings →
Database → Connection string**, tab **URI**. Pick the **session pooler**
form (`postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`)
if you're on an IPv4-only network (most laptops/CI runners) — Supabase's
**direct** connection (`db.<ref>.supabase.co:5432`) is IPv6-only unless the
IPv4 add-on is enabled on the project. Put the filled-in URI in
`.env.local` as `DATABASE_URL=...` (or `SUPABASE_DB_URL`, accepted as an
alias). Never commit it — it contains your database password.

**Do not run `supabase/seed.sql` against this project.** It's dev-only fake
data (three test accounts, `audio_assets` rows pointing at storage keys that
don't exist) — see the banner at the top of that file. (`npm run db:seed`
enforces this itself: it refuses to run when `NODE_ENV=production`.)

**Storage buckets.** Created by migration 13, not by hand in the dashboard:

| Bucket | Access | Contents |
|---|---|---|
| `audio` | **Private** | Original + processed Wave/message audio. No listener `SELECT` policy at all — every read goes through a signed URL minted server-side (`mintSignedAudioUrl`, [`AUDIO_ARCHITECTURE.md`](AUDIO_ARCHITECTURE.md#signed-url-strategy-for-private-audio-spec-33)). |
| `avatars` | **Public** | Profile pictures only — AKINTI has no image posts. |

If either bucket is ever missing (e.g. after a partial reset), re-run
migration 13 rather than creating it by hand in the dashboard — the object
policies it creates are load-bearing (see [`SECURITY.md`](SECURITY.md#storage-security-spec-33)).
`npx tsx scripts/verify-live.ts --create-buckets` (part of the verification
step below) can also create either bucket if missing, with the same
public/private + size-limit + MIME allowlist as migration 13.

**Verify the deploy.** Once migrations are applied:

```bash
npm run verify:live
```

Confirms `profiles`, `waves`, `audio_assets`, `notifications`, `messages`
are reachable over the REST API, that the `audio`/`avatars` buckets exist
with the right settings, and that the `can_view_wave`/`rising_creators` RPCs
are callable — prints a pass/fail table and exits non-zero on any failure.
Needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (the same
two of the three app env vars used everywhere else in this doc).

**Realtime.** Migration 16 adds `notifications` and `messages` to the
`supabase_realtime` publication (messaging/notification live updates).
`audio_assets` was deliberately *removed* from it by migration 19 — a
`postgres_changes` broadcast sends the full row, which would leak the
column-locked `original_path`/`processed_path` storage keys (see
[`AUDIO_ARCHITECTURE.md`](AUDIO_ARCHITECTURE.md#storage-security--column-level-lockdown-spec-33-migration-15)).
Don't re-add it. Nothing further to configure — these migrations already set
the publication up; the Realtime toggle in Project Settings only needs to be
on, which it is by default.

**Auth email settings.**

- Project Settings → Authentication → URL Configuration: set **Site URL** to
  your production web app origin, and add
  `https://<your-domain>/auth/callback` to **Redirect URLs** — this is the
  PKCE code-exchange route both password reset and signup confirmation share
  (`src/app/auth/callback/route.ts`, see [`SECURITY.md`](SECURITY.md#password-reset--email-confirmation)).
  Local dev already has `http://127.0.0.1:3000/auth/callback` from
  `supabase/config.toml`; add your real domain alongside it, don't replace
  it.
- Leave **Confirm email** enabled in production (`supabase/config.toml`
  disables it only for local dev — never disable it against real data).
- The default Supabase auth email templates work as-is; customize copy in
  Authentication → Email Templates if desired, no code change needed.

**`pg_cron` — optional, not required.** Ranking (`trending_waves`) scores
live on every read rather than a cached materialized view, and stalled-job
recovery (`requeue_stalled_audio_jobs`) already runs from the worker's own
maintenance loop roughly once a minute (see
[`AUDIO_ARCHITECTURE.md`](AUDIO_ARCHITECTURE.md#queue-mechanics)) — so
nothing here strictly needs `pg_cron`. If the worker is ever not kept
running continuously (e.g. only invoked on a schedule), enable the
`pg_cron` extension and schedule
`select public.requeue_stalled_audio_jobs();` every few minutes as a
backstop, and `select public.expire_duet_requests();` (migration 06,
`docs/DUET_SPEC.md`) hourly so a `PENDING` Duet request whose window lapsed
actually flips to `EXPIRED` in the absence of the app-level read paths that
already treat an overdue one as expired.

## 2. Web app — Vercel

**Import the repo** (this directory — `app/` is the project root; there is
no separate monorepo root to point Vercel at). Framework preset: Next.js
(auto-detected). Default build command (`next build`) and output are
correct as-is — nothing in `vercel.json` needs to override them.

**Node version.** `.nvmrc`/`package.json#engines` pin `>=20.9.0` (matches
Next 16's own minimum); Vercel reads `engines` automatically. No project
setting needed unless you want to pin a specific patch version in the
dashboard's Node.js Version setting.

**`serverExternalPackages`/`outputFileTracingIncludes` — already configured,
nothing to set in the dashboard, but don't remove them.** `next.config.ts`
sets `serverExternalPackages: ["iyzipay"]` because `iyzipay`'s
`_initResources` dynamically `require()`s every file under its own
`lib/resources/` via `fs.readdirSync` — a pattern Turbopack can't statically
bundle, so this tells Next to `require()` it at runtime instead (correct for
a Node-only server SDK anyway). That alone isn't enough for a Vercel
deployment: Next's file tracing (what decides which `node_modules` files
actually ship) only follows *static* `require`/`import`, so without also
listing `outputFileTracingIncludes` for the three routes that can reach
`src/lib/billing/iyzico.ts` (`/api/billing/iyzico/*`, `/settings/pro`), a
deploy would ship `iyzipay` missing its whole `lib/resources/` directory and
fail at the first real iyzico call — not at build time, in front of a paying
user (review3 finding 33). Both are plain `next.config.ts` fields Vercel
reads automatically from the repo; verify after a deploy by actually
completing an iyzico checkout once (see the smoke checklist below), not by
inspecting build logs alone.

**Environment variables** (Project Settings → Environment Variables — set
for **Production**, **Preview**, and **Development** unless noted):

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project API URL | Public — shipped to the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project `anon` key | Public — RLS is what protects data, not secrecy of this key |
| `SUPABASE_SERVICE_ROLE_KEY` | Project `service_role` key | **Server-only.** Do **not** prefix with `NEXT_PUBLIC_`. Vercel env vars are server-only by default unless explicitly marked "Expose to browser" — leave that off. Read only by `src/lib/supabase/admin.ts`, which throws if ever called from `typeof window !== "undefined"`. |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` | Optional — used by `src/app/sitemap.ts` for absolute URLs. Falls back to Vercel's own `VERCEL_URL` when unset, so this is a nice-to-have for a custom domain, not required. |
| `REQUIRE_SUPABASE` | unset | Not needed on Vercel — `VERCEL=1` is set automatically, which already makes a production boot with missing Supabase vars fail loudly (`scripts/check-env.ts`). Only relevant on a non-Vercel Node host. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key | Public — passed to `PushManager.subscribe()` in the browser. Web Push for Duet requests/answers and open-call answers (`src/lib/push/send.ts`); see below for how to generate. |
| `VAPID_PRIVATE_KEY` | VAPID private key | **Server-only.** Do **not** prefix with `NEXT_PUBLIC_`. Signs every push sent via `web-push`. |
| `VAPID_SUBJECT` | `mailto:you@yourdomain.com` (or an `https://` URL) | Identifies who to contact about this VAPID identity, per the Web Push protocol. Any valid `mailto:`/`https:` value works — push services never actually email it. |
| `IYZICO_API_KEY` / `IYZICO_SECRET_KEY` | From the iyzico Merchant/Sandbox panel | **Server-only.** AKINTI Pro checkout for `_try` plans (`src/lib/billing/iyzico.ts`). |
| `IYZICO_BASE_URL` | `https://api.iyzipay.com` (production) | Defaults to the sandbox API (`https://sandbox-api.iyzipay.com`) when unset — set this explicitly in Production. |
| `IYZICO_MERCHANT_ID` | Numeric merchant id, iyzico panel | **Server-only.** Only used to verify the `X-IYZ-SIGNATURE-V3` webhook signature (docs/BILLING.md) — a different value than `IYZICO_API_KEY`. |
| `PADDLE_API_KEY` | Developer Tools → Authentication, vendors.paddle.com | **Server-only.** AKINTI Pro checkout for `_usd` plans (`src/lib/billing/paddle.ts`). |
| `PADDLE_WEBHOOK_SECRET` | Developer Tools → Notifications → your destination | **Server-only.** Verifies `Paddle-Signature` on `POST /api/billing/paddle/webhook`. |
| `PADDLE_ENVIRONMENT` | `production` | Defaults to `sandbox` when unset. |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | Developer Tools → Authentication, client-side token | Public. Read by `/settings/pro` (`StartProControls.tsx`) to initialize `@paddle/paddle-js`'s hosted checkout overlay in the browser. |
| `NEXT_PUBLIC_PADDLE_ENVIRONMENT` | `production` | Public. Defaults to `sandbox` when unset or any other value — the client-side counterpart to the server-only `PADDLE_ENVIRONMENT` above; both must agree, or checkout will initialize against one Paddle environment while the server-side webhook/API calls hit the other. |

Push notifications are optional at runtime: `src/lib/push/send.ts` no-ops
silently (no throw, no crash) when any of the three VAPID variables is
missing — a deploy without them simply never sends a push, same as leaving
`NEXT_PUBLIC_SITE_URL` unset. AKINTI Pro billing behaves the same way per
provider: `startProCheckout` for a `_try` plan fails with an honest error
(never a fake success) until the iyzico variables are set, and independently
for a `_usd` plan and the Paddle variables — see `docs/BILLING.md`.

**Webhook endpoints to register** with each provider (Production URL, not
localhost):
- iyzico Subscription product settings: `https://<your-domain>/api/billing/iyzico/webhook`
- Paddle Notifications → Webhook destination: `https://<your-domain>/api/billing/paddle/webhook`, subscribed to at least `subscription.created`, `subscription.updated`, `subscription.activated`, `subscription.trialing`, `subscription.past_due`, `subscription.paused`, `subscription.canceled`, `subscription.resumed`.

**Generating a VAPID key pair.** One pair per environment (or reuse one pair
everywhere — it identifies the sender, not the deploy):

```bash
npx web-push generate-vapid-keys
```

Put the public key in both `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Vercel) and, if
testing locally, `.env.local` — never commit `.env.local`. Rotating the pair
invalidates every existing browser subscription (`public.push_subscriptions`,
migration `20260905170000`); they clean themselves up the next time a push to
a since-invalidated endpoint 404s/410s (`src/lib/push/send.ts`).

A production boot with any Supabase variable missing **fails at server
startup** (`src/instrumentation.ts` → `assertWebEnvAtBoot()`) rather than
silently serving a half-configured app — this is intentional per spec §44
rule 9 ("never fake functionality"). A `next build` with no env vars set
still succeeds, on purpose, so preview builds/CI never require secrets just
to compile.

**Deploy.** Push to the connected branch, or `vercel --prod`. First deploy
takes a few minutes; subsequent ones are incremental.

## 3. Worker deployment

The worker is a long-running Node process, not a Vercel function —
`Dockerfile.worker` builds an image with `ffmpeg`/`ffprobe` preinstalled and
runs `scripts/worker.ts` through `tsx` (same as `npm run worker` locally).

```bash
docker build -f Dockerfile.worker -t akinti-worker .
docker run --rm \
  -e NEXT_PUBLIC_SUPABASE_URL=... \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
  -e SUPABASE_SERVICE_ROLE_KEY=... \
  akinti-worker
```

Or, for local testing / a VPS running Compose directly:

```bash
cp .env.example .env.local   # fill in the three Supabase values
docker compose -f docker-compose.worker.yml up --build -d
```

The entrypoint runs `npm run check-env:worker` before starting the poll
loop — a missing secret fails the container immediately with a clear
message instead of an obscure crash on the first claimed job.

**Where to run it — any of these work, pick based on cost/ops preference:**

- **Fly.io** — `fly launch --dockerfile Dockerfile.worker`, then
  `fly secrets set NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...`.
  No exposed port needed (`fly.toml`'s `[[services]]` block can be omitted
  entirely) — the worker only makes outbound connections to Supabase.
- **Railway** — new project → Deploy from Dockerfile → point at
  `Dockerfile.worker` → set the three variables → no public networking
  needed, same reasoning.
- **A plain VPS** — `docker compose -f docker-compose.worker.yml up -d`
  (`restart: unless-stopped` is already set, so it survives a reboot).

**Scaling.** `claim_audio_jobs` uses `FOR UPDATE SKIP LOCKED`, so more than
one worker instance can run against the same queue safely — jobs are never
double-claimed. Start with one; add a second only once queue depth
(`select count(*) from audio_processing_jobs where status = 'pending'`)
shows it's actually falling behind.

## 3a. Sidecar deployment (optional, but recommended)

The sidecar (`sidecar/`, `Dockerfile.sidecar`) is a separate Python/FastAPI
process the worker calls over local HTTP for DSP with no good Node
equivalent — DeepFilterNet3 denoising, Matchering reference mastering, and
librosa pYIN pitch scoring (`docs/AUDIO_ARCHITECTURE.md` "Audio pipeline
stages"). It is **not required** for the app to function: every capability
it provides has a real, honest fallback (`arnndn`/`loudnorm` in ffmpeg for
clean/master, no pitch score at all for `/pitch-score` — never a fake one)
except `pitch_snap`/`self_harmony` (the two AKINTI Pro sounds), which have no
local equivalent and fail their job outright if the sidecar is unreachable
rather than silently downgrading a paying customer's chosen sound. Deploy it
if you want those three things; skip it otherwise and the rest of the app
degrades exactly as designed.

**Separate image on purpose:** Matchering is GPL-3.0 and must never share a
binary/deploy artifact with the proprietary Next.js app or worker — see
`sidecar/README.md` "Why a separate process (GPL isolation)". It talks to
nothing but the worker, over plain HTTP, with no auth of its own — **never
expose it on a public port.** Run it on the same private network/host as the
worker (same Fly app as a second process, same Railway project with private
networking, or the same VPS/Compose file) and point the worker at it with
`SIDECAR_URL=http://<private-host>:8011`.

```bash
docker build -f Dockerfile.sidecar -t akinti-sidecar .
docker run --rm -p 8011:8011 akinti-sidecar   # bind to a private interface only in production
```

No environment variables required — the sidecar never talks to Supabase
directly, only to the worker that calls it. `GET /health` reports which
capabilities actually loaded on the target machine/architecture (see
`sidecar/README.md`'s example response); confirm `librosa: true` and
`pitch_score: true` there before trusting a "How it sounded" pitch report or
the two Pro sounds in production. On a Linux build image with a working Rust
toolchain, `deepfilternet` installs normally with no code change — the
Windows dev machine this stage was verified on falls back to `arnndn`
instead (`sidecar/README.md` "What actually works on this machine").

Point the worker at it: set `SIDECAR_URL` (default
`http://127.0.0.1:8011`, only correct if both run in the same container/pod
network namespace), `SIDECAR_TIMEOUT_MS` (default `120000`),
`SIDECAR_RETRIES` (default `1`) alongside the worker's three Supabase
variables.

## 4. Post-deploy smoke checklist

Run through this once after every deploy that touches auth, storage, or the
worker — not a substitute for the automated suite, but the fastest way to
catch a misconfigured env var or redirect URL before a real user does:

- [ ] `curl -I https://<domain>/explore` — `200`, and the security headers
      from `next.config.ts` are present (`Content-Security-Policy`,
      `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
      `Strict-Transport-Security`).
- [ ] Sign up with a throwaway email → confirmation email arrives → link
      lands on `/auth/callback` → redirects into onboarding, not an error
      page (validates the Redirect URLs step above).
- [ ] Complete onboarding → record or upload a Wave → publish succeeds
      immediately (asset may still be `pending`/`processing` — that's
      expected until the worker picks it up).
- [ ] Worker container logs show it claiming and completing that job within
      one poll interval (default 5s) — `processing_status` flips to
      `ready` on the Wave detail page's `ProcessingBanner` without a manual
      refresh (it polls every 4s).
- [ ] Play the published Wave — confirms a signed URL was actually minted
      (`GET /api/audio/[assetId]/url`) and the `audio` bucket policy is
      correct.
- [ ] Open the same Wave in a second, signed-out browser/incognito window —
      plays if `everyone` visibility, denied (404, not 403) if private.
- [ ] Request a Duet from a second account, accept it, confirm the
      notification arrives in real time (validates the Realtime publication
      step above).
- [ ] `GET /sitemap.xml` and `GET /robots.txt` both return `200`.
- [ ] `/explore` shows the seeded backing tracks and challenges (validates
      the seed order below ran) and `/challenges` loads without error.
- [ ] `/settings/pro` renders real plan prices for at least one provider
      (validates `seed:plans` — a plan whose price-id env var was never set
      is skipped, not shown with a placeholder, so an empty screen here
      means that provider's plan rows were never seeded, not a bug).
- [ ] Complete one real checkout per configured provider (iyzico and/or
      Paddle) with a sandbox/test card, confirm the webhook lands (`billing_events`
      row inserted, `subscriptions.status` becomes `active`/`trialing`) and
      `has_pro()` flips — this is also the real verification that
      `outputFileTracingIncludes` above shipped `iyzipay`'s resources
      correctly, since a missing-file runtime error would surface exactly
      here.
- [ ] If the sidecar is deployed: `GET <sidecar-url>/health` reports
      `librosa: true` and `capabilities.pitch_score: true`; publish a Wave
      with real pitch content and confirm a "How it sounded" pitch report
      eventually appears on its page (`docs/qa/pitch/` has a reference
      screenshot from this exact check).
- [ ] If VAPID variables are set: subscribe to push from Settings →
      Notifications, request a Duet from a second account, confirm a real
      OS-level push notification arrives (not just the in-app one).

## 4a. Seeding order

Run once against a freshly-migrated production project, in this order —
later scripts assume earlier ones' data exists, all three are idempotent
(safe to re-run):

1. **`npm run seed:backing-tracks`** — uploads the 12 curated CC-BY
   instrumentals to the `audio` bucket and creates their `backing_tracks`
   rows. No dependencies. Needs the worker running (or run once manually
   right after) to actually process each track's audio.
2. **`npm run seed:challenges`** — seeds the first two weekly challenges,
   one of which pairs itself with a curated backing track *if one has
   already been seeded* — run after step 1, not before, or that challenge
   silently seeds without a backing track instead of failing.
3. **`npm run seed:plans`** — seeds the `plans` catalog (`docs/BILLING.md`
   "Seeding plans"). Independent of the other two, but requires each price
   already created by hand in the provider's own dashboard first (iyzico
   Merchant Panel → Subscription → Products & Pricing Plans; Paddle →
   Catalog → Prices) and passed in as an env var
   (`IYZICO_PLAN_MONTHLY_TRY`/`IYZICO_PLAN_YEARLY_TRY`/`PADDLE_PRICE_MONTHLY_USD`/
   `PADDLE_PRICE_YEARLY_USD`, plus the two `*_YEARLY_*_AMOUNT` variables —
   see the script's own header). A plan whose price-id variable is unset is
   skipped with a clear message, never inserted with a placeholder — run
   this script again after adding a variable rather than editing `plans`
   by hand.

`npm run db:seed` (which also runs `supabase/seed.sql`, dev-only fake data)
is unrelated to all three and refuses to run when `NODE_ENV=production` —
never point it at this project.

## 4b. Key rotation

**`SUPABASE_SERVICE_ROLE_KEY`** and **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**: full
steps in [`OPERATIONS.md`](OPERATIONS.md#rotating-keys--secrets) — briefly,
regenerate in the Supabase dashboard (Project Settings → API), update it
everywhere it's set (Vercel env vars, the worker/sidecar host's secret
store, local `.env.local`), then redeploy the web app and restart the
worker container — neither hot-reloads an env var change, and the old
`service_role` key stops working the instant it's regenerated (no grace
period).

**Database password (`DATABASE_URL`)** — used only by
`scripts/apply-migrations.ts` and `OPERATIONS.md`'s `pg_dump`/`pg_restore`
backup commands, never by the deployed web app, worker, or sidecar (none of
the three hold a direct Postgres connection string):

1. Supabase dashboard → Project Settings → Database → **Reset database
   password** — this immediately invalidates the old password on every
   connection string built from it (both the direct and pooler forms).
2. Rebuild `DATABASE_URL`/`SUPABASE_DB_URL` with the new password wherever
   it's stored (CI secrets for a migration step, an operator's local
   `.env.local`, a backup cron's environment) — there is no automatic
   propagation since nothing long-running holds this credential.
3. Nothing to redeploy: the web app/worker/sidecar never read this
   variable, so rotating it has zero runtime impact on them. The only
   observable effect is the next `npm run db:migrate`/`pg_dump` invocation
   needing the updated value.

**When to rotate either:** the credential appeared in a public commit/log, a
former collaborator's access should be revoked, or as routine hygiene —
nothing in this codebase expires these automatically.

## 5. Rollback

**Web app.** Vercel keeps every deployment — use Instant Rollback in the
dashboard, or `vercel rollback <deployment-url>`. No database action needed
for a UI-only regression.

**Database.** Every migration has a matching file under
`supabase/migrations/down/`. Roll back in the **reverse** of the apply order
(drop dependents before what they depend on), applying each `down/*.sql`
through the SQL editor or `psql`. Read each file's header first — several
call out an ordering requirement, and
`down/20260903121200_row_level_security_down.sql` specifically is marked
**local-development-only**: it leaves every table world-readable/writable,
which is never acceptable to run against a production database with real
user data. Full detail: [`supabase/README.md`](../supabase/README.md#rolling-back).

If a rollback is only needed because of a bad *application* deploy (not a
schema problem), prefer rolling back the Vercel deployment alone — a schema
rollback is a last resort, not the default response to a bad release.

**Worker.** Redeploy the previous image tag (`docker run <registry>/akinti-worker:<previous-tag>`,
or the equivalent "redeploy previous release" action on Fly.io/Railway). The
job queue is durable in Postgres, so a worker rollback/restart never loses a
queued job — anything left `processing` past the stall window is
automatically requeued by `requeue_stalled_audio_jobs` (see
[`OPERATIONS.md`](OPERATIONS.md#worker-stuck-jobs)).
