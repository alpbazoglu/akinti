# review3 — pre-launch code and security review

Scope: every commit after `059c634` up to HEAD (89 commits) — fixR2 backend/frontend, fixQA,
waveE-pwa (Serwist, push), waveE-perf/perf2/perf3 (`React.cache`, `inlineCss`, cache headers),
loose-ends (delete-user cascade, DuetRequestsView), waveF-backend (subscriptions schema, iyzico +
Paddle, webhooks, callback, `settings/pro`), waveF-frontend (Pro screen, ProGate, Pro mark, Pro
preset gate), colour v2, flow (`flow_impressions`, `get_flow_page`, `record_flow_event`,
`count_flow_new`, Flow screen, analyser, default route), pitch-harmony (enum migration,
`set_audio_asset_pitch_score`, sidecar pitch-snap/harmony endpoints, worker, OwnerInsights,
billing resume), i18n (next-intl, locale cookie/column, message files, `requireUser` refactor).
Screenshots under `docs/qa/**` were not reviewed. String-only diffs in `actions.ts` files were
skipped (i18n-c is editing them concurrently). No servers or browsers were started.

Judged against `CLAUDE.md`, `docs/SECURITY.md`, `docs/BILLING.md`, `docs/FLOW.md`,
`docs/design/COLOR_V2.md` and `docs/qa/review2/REVIEW.md`.

## Verification

```
npm run typecheck   PASS (exit 0)
npm run lint        PASS (0 errors, 57 warnings, all reported as 9:<col> inside one bundled
                    third-party file; i18n-check: no new hardcoded copy beyond baseline)
npm run test        PASS — 78 files, 834 tests, 0 failures (20.8s)
npm run build       PASS — 45 routes, all dynamic; serwist precached 91 URLs / 2.76 MB
```

A grep of `.next/static` and `.next/server/app` for `VAPID_PRIVATE`, `IYZICO_SECRET`,
`PADDLE_API_KEY`, `SUPABASE_SERVICE_ROLE` and `PADDLE_WEBHOOK_SECRET` returns no matches.
`.env.example` holds placeholders only. `iyzipay` appears in no client chunk.

## Score: 5/10

The backend layering is again the strongest part of this range. `get_flow_page` being
`SECURITY INVOKER` on top of tables that already carry `can_view_wave` is the right call, and it
is argued for in the migration header rather than asserted. Both webhook routes verify the raw
body before parsing, `billing_events` is unique on `(provider, event_id)`, and neither provider
module ever touches the database. review2's P0 and both storage/atışma P1s are genuinely fixed,
and the suite grew from 641 to 834 tests in exactly the places review2 said were bare.

The score is low because five things in this range would not work, or would not be safe, on the
first day in production: two concurrent migrations silently delete each other's rate-limit action
so no Pro checkout can complete at all; the CSP blocks both payment rails outright; the AKINTI Pro
gate can be skipped with one rpc call from the browser, in two independent ways; and Flow's
`AnalyserNode` routes the shared `<audio>` element through Web Audio without `crossOrigin`, which
mutes cross-origin playback for the rest of the tab. None of the five is subtle once looked for.
None is covered by a test. All five sit in the two features this range exists to ship.

## Findings

| # | Sev | File:line | Issue | Why it matters | Suggested fix |
|---|---|---|---|---|---|
| 1 | **P0** | `supabase/migrations/20260906100000_subscriptions.sql:196-204`; `supabase/migrations/20260906110000_flow.sql:62-70` | Both migrations drop `rate_limit_events_action_known` and re-add it with their own action appended, and neither includes the other's. The subscriptions list ends `'challenge_entry', 'billing_checkout'` (no `flow_event`); the flow list ends `'challenge_entry', 'flow_event'` (no `billing_checkout`). | Applied in filename order, `...110000` runs second and erases `billing_checkout`. `startCheckout` calls `record_rate_limit_event(user, 'billing_checkout')` at `src/lib/billing/index.ts:116` — after `provider.createCheckout()` has already created a real checkout at iyzico/Paddle, and after `createPendingSubscription` has inserted the placeholder row at `:106`. Every Pro checkout therefore dies on a check-constraint violation, shown to the buyer as "We couldn't start checkout", while a provider-side checkout and a stray `subscriptions` row already exist. The `check_rate_limit` read at `:81` never sees a row either, so the 5/hour limit is silently inert. Two concurrent waves edited the same constraint and neither read the other's file. | A third migration re-adding the constraint with both values, plus its `down/`. Longer term this should not be a closed `check` at all: an `action` lookup table cannot be clobbered by the next wave that needs a new action. |
| 2 | **P0** | `next.config.ts:40`, `:44`, `:47` | CSP is `script-src 'self' 'unsafe-inline'`, `connect-src 'self' <supabase>`, `frame-src 'none'`. Neither payment provider appears anywhere in it. | `StartProControls.tsx:146-155` calls `initializePaddle`, which injects a script from `cdn.paddle.com` and opens the checkout in an iframe on `buy.paddle.com`. `IyzicoCheckoutEmbed.tsx:29-40` deliberately re-creates iyzico's own script element so it executes — that script loads `static.iyzipay.com` and renders its form in an iframe. Both external scripts are blocked by `script-src`, both iframes by `frame-src 'none'`, and both providers' XHRs by `connect-src`. AKINTI Pro cannot take a payment on either rail, and the failure mode is a console-only CSP violation: the button simply does nothing. | Add the origins the two SDKs need — `script-src https://cdn.paddle.com https://static.iyzipay.com`, `frame-src https://buy.paddle.com https://sandbox-buy.paddle.com https://*.iyzipay.com`, `connect-src https://*.paddle.com https://*.iyzipay.com` — plus whatever `img-src`/`style-src` each SDK documents. Then walk one sandbox checkout per rail with the console open; this is not verifiable by reading. |
| 3 | **P0** | `supabase/migrations/20260903121200_row_level_security.sql:658`; `supabase/migrations/20260903120300_audio_assets_and_jobs.sql:263`, `:283` | `enqueue_audio_job(uuid, audio_job_type, jsonb)` is granted to `authenticated`, checks only that `auth.uid()` owns the asset, and inserts `p_payload` verbatim. The preset the worker applies is `payload.preset` — an unvalidated, client-supplied jsonb field. | The AKINTI Pro gate exists only in a Server Action (`src/app/(app)/create/actions.ts:117-130`). A free account skips it with one browser call: `supabase.rpc('enqueue_audio_job', { p_audio_asset_id: <their own asset>, p_job_type: 'process_audio', p_payload: { preset: 'pitch_snap', advanced_eq: null } })`. `scripts/worker.ts:793` then routes it to the sidecar's pitch-snap endpoint and never re-checks `has_pro`. This is the exact bypass docs/BILLING.md says cannot happen, and it breaks CLAUDE.md's rule that the database is the authority: every other authorization rule in this schema is enforced in Postgres, this one is not. | Enforce it where the others live. In `enqueue_audio_job`, raise `42501` when the payload preset is `pitch_snap`/`self_harmony` and `public.has_pro(auth.uid())` is false. Keep the Server Action check for the friendly message. |
| 4 | **P0** | `supabase/migrations/20260906120000_pro_presets_pitch.sql:77-89`; `supabase/migrations/20260903121200_row_level_security.sql:609-613` | A second, independent route to the same bypass: `authenticated` holds table-level UPDATE on `audio_assets`, `audio_assets_update_own` permits the owner, and `audio_assets_guard_update` locks eleven server-owned columns but not `enhancement_preset`. | `createUploadTicket({ enhancementPreset: 'natural' })` passes the gate; a direct PostgREST PATCH then sets `enhancement_preset = 'pitch_snap'`; `finalizeUpload` (`create/actions.ts:302`) reads the preset back from the row and enqueues it. Fixing finding 3 alone does not close this one. | Add `or new.enhancement_preset is distinct from old.enhancement_preset` to the guard's condition — or better, have the guard call `has_pro(auth.uid())` when the new value is one of the two Pro ids. |
| 5 | **P0** | `src/lib/audio/analyser.ts:56`; `src/lib/audio/playbackStore.ts:167-171` | `getFlowAnalyser` calls `context.createMediaElementSource(element)` on the single global `<audio>`. `defaultCreateAudio()` sets `preload` and nothing else — `crossOrigin` is declared on the interface at `playbackStore.ts:117` but is never assigned anywhere in `src/`, only in the test fake at `playbackStore.test.ts:21`. | Every playback `src` is a Supabase Storage signed URL (`/api/audio/[assetId]/url:50` returns a `https://<ref>.supabase.co/...` URL). A media element loaded without the `crossorigin` attribute is CORS-cross-origin, and per the Web Audio spec a `MediaElementAudioSourceNode` built on such a resource outputs silence — the response's CORS headers do not help, the fetch itself has to be a CORS fetch. So the first frame of `FlowTrace`'s RAF loop (`FlowTrace.tsx:65`) silently mutes Flow. Worse, `analyser`/`attachedElement` are module-level singletons and the source node stays connected for the tab's lifetime, so leaving Flow does not restore audio anywhere else in the app either. Flow is the default post-login screen (`src/lib/supabase/middleware.ts:64`). | Set `element.crossOrigin = "anonymous"` in `defaultCreateAudio()` before any `src` is assigned (setting it afterwards needs a reload), and confirm the Storage bucket returns `Access-Control-Allow-Origin` on signed objects. Then verify audibly on a real device; a screenshot cannot catch this. |
| 6 | **P1** | `src/app/(app)/settings/actions.ts:374-391`; `supabase/migrations/20260906100000_subscriptions.sql:89` | `deleteAccount` removes storage objects and calls `auth.admin.deleteUser`. It never calls `cancelSubscriptionForUser`, and `subscriptions.user_id` is `on delete cascade`, so the local row disappears with the profile. | The provider is never told. iyzico/Paddle keep charging a card for an account that no longer exists, and the only record linking that subscription to a person is gone, so support cannot even find it to refund. This is a real-money bug and a KVKK erasure gap at once, and docs/BILLING.md's own KVKK note asks for the opposite. | Before `deleteUser`, call `cancelSubscriptionForUser(admin, user.id)` inside a try/catch that refuses the deletion on failure, the same shape the storage step already uses at `:381`, so nobody is ever deleted while still being billed. |
| 7 | **P1** | `src/lib/billing/repository.ts:158-176`, `:220` | `applyBillingEvent` inserts into `billing_events` first, then applies the state transition, with no transaction around the two. The duplicate branch at `:172` returns without checking `processed_at`. | If the `subscriptions` update throws at `:190` the route returns 500, the provider retries, the insert hits `23505`, `applyBillingEvent` reports a duplicate, the route returns 200 — and the transition is lost permanently. The `processed_at` column exists for exactly this case and nothing ever reads it. A user who paid stays `trialing` forever, or a cancelled subscription stays `active`. | On `23505`, re-read the row and short-circuit only when `processed_at` is not null; otherwise fall through and apply. Better, move the insert and the update into one `SECURITY DEFINER` function so they commit together. |
| 8 | **P1** | `src/lib/billing/iyzico.ts:283`, `:105` | `parseEvent` maps only `subscription.order.success` to `active`; every other iyzico event that carries a `subscriptionReferenceCode` is written as `past_due`, and `mapStatus`'s default does the same. | `has_pro()` excludes `past_due`, so any iyzico subscription event this codebase does not specifically recognise instantly revokes Pro from a paying customer, with no route back except the next successful renewal webhook. Combined with finding 7 (no ordering guard, so a late retry can overwrite a newer state) this is the least trustworthy part of the state machine, and it is the half with no tests. | Return a null status for any event type that is not a known state transition — `applyBillingEvent:178` already skips the update when the status is null, so an unrecognised event is recorded in the ledger and changes nothing. Downgrade only on an explicit failure, cancel or expire event. |
| 9 | **P1** | `src/lib/validation/push.ts:14`; `src/lib/push/send.ts:102-108` | `endpoint: z.string().url()` accepts any scheme and any host, and `web-push` then POSTs to it from the server. | Any signed-in account can register a loopback address, a link-local metadata address or an internal hostname as a push endpoint and make the serverless function issue an authenticated POST to it on the next Duet notification. Blind SSRF, but a real one, and this is the only place in the codebase where a user-supplied URL is fetched server-side. | Require `https:` and an allowlisted host suffix (`fcm.googleapis.com`, `.push.services.mozilla.com`, `.notify.windows.com`, `web.push.apple.com`) with a `refine` in the schema, so the check sits at the boundary rather than at the send site. |
| 10 | **P1** | `src/app/sw.ts:63` (the `defaultCache` spread) | `@serwist/next`'s `defaultCache` ends with three broad `NetworkFirst` entries: `pages-rsc` (RSC header, same origin), `pages-html` (an HTML content type, same origin) and `others` (any same-origin non-API request), each 32 entries for 24h. | The file's own header claims runtime caching is "deliberately narrow rather than cache everything". It is not: every authenticated page — `/messages/[id]`, `/settings/privacy`, `/moderation`, `/analytics`, Flow — is stored in CacheStorage as rendered HTML/RSC. Nothing clears it at sign-out, so on a shared device the next person can be served the previous account's DM thread from cache whenever the network is slow or offline. `NEVER_CACHE_PATTERNS` at `:38-46` correctly protects signed audio URLs and stops there. | Add a matcher before the `defaultCache` spread that answers same-origin document and RSC navigations with `NetworkOnly` (or exempts only the routes `isPublicRoute` already enumerates), and delete the three page caches at sign-out. Correct the header comment either way. |
| 11 | **P1** | `src/app/(app)/flow/page.tsx:48` vs `src/components/flow/FlowScreen.tsx:79`, `:141` | Page one calls `getFlowPage` with no seed, so `p_seed` defaults to `0`. `FlowScreen` then picks a random seed and passes that for every later page. | Bucket 4's score includes a seeded jitter term (`20260906110000_flow.sql:243`) and the keyset cursor compares on that exact score. Changing the seed between page one and page two shifts every rising Wave's score, so the cursor predicate skips some Waves and re-serves others — the one thing docs/FLOW.md promises never happens ("never repeats within a session"). | Generate the seed on the server in `page.tsx`, pass it to `FlowScreen` as a prop, and use that one value for every page of the session. |
| 12 | **P1** | `src/app/layout.tsx:136` | `NextIntlClientProvider` wraps the whole tree with no `messages` prop, so next-intl serializes the entire bundle to the client. | `src/messages/en.json` is 59 KB and `tr.json` 61 KB. That whole bundle rides the RSC payload of every route, including `/login` and Flow. perf2/perf3 fought for roughly 830 ms of LCP by inlining a 12.6 KB stylesheet; this quietly adds five times that weight to every response, and it is invisible to `scripts/perf-budget.ts`, which measures JS chunks rather than the RSC payload. | Pass a narrowed set at the root and provide route-specific namespaces closer to where they are used. Add RSC payload size to the perf budget so this cannot regress silently. |
| 13 | **P1** | `src/components/flow/useFlowNewCount.ts:20-29`; `supabase/migrations/20260906110000_flow.sql:422-452` | The nav badge fetches `count_flow_new()` on every mount, and the shell's nav re-mounts on every route change. | `count_flow_new` counts distinct rows over all of `waves`, RLS-filtered through `can_view_wave` per row, with three correlated `NOT EXISTS` subqueries and no `LIMIT`. That is a full pass over the Wave table on every navigation, per user, for a decorative number, and it sits on the critical path of every page transition. It will be the first query to fall over as content grows. | Cap it (an inner `limit 100`, then count, displaying `99+`), fetch once per session rather than per mount, and add the covering indexes the three `NOT EXISTS` clauses need. |
| 14 | **P1** | `src/app/(app)/flow/page.tsx:51-53` | `initialError = err.message` — the raw `DatabaseError`/Postgres message is passed to `FlowScreen` and rendered by `FlowEmptyState`. | Two rules at once: CLAUDE.md bans engineering language in user copy, and a raw Postgres error string on the default landing screen leaks function and schema names to anyone who can trigger it. Every other surface in this codebase maps errors through `src/lib/moderation/errors.ts` first, and the `else` branch three lines below already has the right translated copy. | Log the error, render the translated `loadError` copy in both branches, and drop the `instanceof Error` special case. |
| 15 | **P1** | `src/lib/billing/repository.ts:153` | There is no test anywhere for `applyBillingEvent`. The idempotency check, the update-existing, create-from-metadata and unknown-subscription branches are all untested; the two provider test files cover signature verification and `parseEvent` field mapping only. | docs/BILLING.md tells the reader to see `repository.ts#applyBillingEvent` for the idempotency and state-transition logic and the provider test files for state-transition tests — those tests do not test that function. Findings 7 and 8 both live in the untested half, and this is the money path. | Add a `repository.test.ts` driving a fake admin client: a duplicate event id must not re-apply; a unique-violation after a failed update must still apply on retry; a Paddle event with custom data must create a row; one without must not. |
| 16 | P2 | `src/lib/billing/index.ts:164`, `:168` | `handleWebhook` calls `verifyWebhook` and then `parseEvent`, and for Paddle both re-run the SDK's `isValidSignature`, which hard-rejects any signature whose timestamp is more than 5 seconds old (`@paddle/paddle-node-sdk/.../webhooks-validator.js`, `MAX_VALID_TIME_DIFFERENCE = 5`). | A Vercel cold start plus `createAdminClient()` plus the body read can exceed 5 seconds, and verifying twice doubles the exposure: the first check can pass at 4.9s and the second throw at 5.1s, returning 500. Legitimate Paddle webhooks will intermittently 401 or 500 and be retried. Note also that the SDK compares the HMAC with `===`, not a constant-time compare — not our code, but worth knowing. | Verify once: have `parseEvent` take the already-verified payload, or call `unmarshal` alone (it verifies) and drop the separate `verifyWebhook` call on the Paddle path. |
| 17 | P2 | `src/app/(app)/settings/pro/actions.ts:99` | `returnUrl: z.string().url()` — the client sends `window.location.href` (`StartProControls.tsx:127`), but the action accepts any absolute URL. | It becomes iyzico's `callbackUrl` and Paddle's `checkout.url`. A caller can point the completed-checkout POST (carrying the iyzico token) or the post-payment redirect at an arbitrary host. Self-inflicted rather than cross-user, but it also means the callback that swaps the placeholder `provider_subscription_id` for the real one can be diverted, leaving a stuck `trialing` row. | Refine the URL to the app's own origin, or drop the parameter entirely and build the return URL server-side from `routes.settingsPro()`. |
| 18 | P2 | `supabase/migrations/20260906110000_flow.sql:289-304`, `:333`; `src/components/flow/FlowScreen.tsx:431` | The `invitations` CTE excludes `flow_impressions` but is never anti-joined against `ranked_seq`, so a Wave that is both rising (bucket 4) and an open Open Call can be emitted twice in the same page. | `FlowScreen` keys its windowed items on `wave.id`, so a duplicate is a React duplicate-key collision on the default screen, and the reader sees the same Wave twice in a feed whose whole promise is that it never repeats. | Add `and not exists (select 1 from ranked r where r.id = w.id)` to the `invitations` CTE, and de-duplicate defensively in `hydrateFlowWaves`. |
| 19 | P2 | `src/app/(app)/flow/hydrateFlow.ts:38` | `Promise.all(waves.map((wave) => getAudioAssetById(db, wave.audioAssetId)))` — one round trip per Wave, ten per page. | The file's own header says "one round trip per related table across the whole page, never one per Wave". `getProfilesByIds` and `listSavedWaveIds` do exactly that two lines above; the asset fetch does not. A doc comment contradicted by the code three lines below it is worse than no comment. | Add a `getAudioAssetsByIds(db, ids)` alongside `getProfilesByIds` and use it, or fix the comment. |
| 20 | P2 | `src/components/flow/FlowScreen.tsx:190-199`, `:205-213` | Both `goToIndex` and the `onEnded` handler run side effects — `sendFlowEvent(...)` and `setIndex(...)` — inside a `setItems` updater function. | State updaters must be pure; React may invoke them twice, and `reactStrictMode` is on (`next.config.ts:79`), so in development every skip fires two `record_flow_event` calls and `setIndex` runs during another component's update phase. It also burns the 600/hour `flow_event` budget at double rate. | Read `items` from a ref (or move the work into a `useEffect`) and call `sendFlowEvent`/`setIndex` outside the updater. |
| 21 | P2 | `src/app/(app)/settings/actions.ts:377-391`; `src/lib/storage/userObjects.ts:101` | Storage objects are deleted before `auth.admin.deleteUser`. If `deleteUser` then fails, the account survives with every one of its recordings destroyed and not one row changed. | `userObjects.ts:101` claims the caller "treats any failure here as do not delete the account, so this never partially deletes storage while reporting success" — true of a listing failure, false of the far more likely `deleteUser` failure, which produces exactly that partial state. On a product made of people's voices, silent irreversible loss on the retry path is the wrong default. | Delete the auth user first (the rows cascade), then sweep storage: a leftover object is recoverable, a deleted recording is not. Correct the comment either way. |
| 22 | P2 | `src/messages/en.json:566` | `"ownWaveDescription"` contains an em dash: "You don't request a Duet on your own Wave — record one directly from it instead." | DESIGN §12.22 bans the em dash character in any user-visible string. `tr.json` has zero, so this is the last one in either file, and `scripts/i18n-check.ts` does not look for it. | Replace with a middle dot or a full stop, and add an em-dash scan to `i18n-check.ts` so the rule is enforced rather than remembered. |
| 23 | P2 | `src/lib/ui/profileTheme.ts:124`, `:108`; `src/types/domain.ts:110`; `src/lib/ui/designTokens.test.ts:91-95` | `ACCENT_PRESETS.violet` is `#6a4ce0` and `BACKGROUND_PRESETS.plum` is `#4b3153` — shipped, user-selectable profile themes — plus a `GRADIENT_PRESETS` block, and `THEME_ACCENTS` still lists `violet`. | COLOR_V2 §3 is unambiguous: no purple, no violet, no indigo, no gradients. The test that is meant to enforce this only reads `globals.css`, so it passes while purple hex literals sit in a `.ts` file outside `globals.css`/`DESIGN_DNA.json`, which CLAUDE.md forbids on its own. Pre-existing, but the colour v2 wave was the moment to retire it. | Remove `violet`/`plum` from the presets and the `THEME_ACCENTS` union (with a migration remapping existing rows), and widen `designTokens.test.ts` to scan `src/**/*.ts{,x}` for hex literals and purple names, not just `globals.css`. |
| 24 | P2 | `src/components/settings/DeleteAccountSheet.tsx:42` | `void deleteAccount({...}).then(...)` still has no `.catch()` — review2 finding 15, unfixed. | A Server Action network failure rejects rather than resolving; `deleting` stays true forever, `close()` returns early while deleting, and the sheet cannot be dismissed, on the one screen where being stuck is most alarming. | Add a `.catch()` that clears `deleting` and sets a translated form error. |
| 25 | P2 | `src/test/next-intl-mock.ts:38-44`; `src/messages/en.json:331-335` | The vitest mock's `interpolate` is a naive `replaceAll` of `{name}` placeholders. Twelve messages use real ICU plural syntax. | Any component test rendering a metric line asserts against the raw ICU source string and passes, while production renders "3 plays". The mock hides exactly the formatting layer next-intl was adopted for. It also only ever resolves `en.json`, so no test exercises Turkish rendering at all. | Use next-intl's real `createTranslator` over `en.json` inside the mock (it is synchronous and needs no provider), and add one test that renders a plural in both locales. |
| 26 | P2 | `src/i18n/global.ts:11-12`; `scripts/i18n-check.ts` | The comment says `tr.json` "must have the exact same keys as `en.json` by convention, checked by `scripts/i18n-check.ts`". That script only scans `.tsx` files for hardcoded JSX copy; it never compares the two message files. | Parity happens to be perfect right now (1070/1070, verified by hand), but nothing enforces it. A missing `tr` key renders the raw key path to a Turkish user — next-intl's default `getMessageFallback` — with no build or test failure. | Add a key-set diff of `en.json` against `tr.json` to `i18n-check.ts` and fail on any asymmetry. |
| 27 | P2 | `src/components/pro/pricing.ts:31-33`, `:35-41`; `src/components/pro/StartProControls.tsx:73-75` | `detectProCurrency` is only ever called with no argument (through `useDetectedCurrency`), so currency comes from `navigator.language` alone. The doc comment still says "`profiles` carries no locale column yet" — it does now, added by `20260906130000_profile_locale.sql` in this same range. | PRODUCT_V2 §4's "TR to iyzico" rule is approximated by browser language: a Turkish user with an English browser is routed to Paddle/USD, and someone abroad with a Turkish browser is routed to iyzico and asked for a TC identity number they do not have (`iyzicoBuyerSchema.identityNumber`, `settings/pro/actions.ts:89`). | Thread the resolved locale (`getLocale()`, already available in the page) into `ProScreen`/`StartProControls` and pass it to `detectProCurrency`; keep `navigator.language` as the signed-out fallback only. Update the stale comment. |
| 28 | P2 | `src/app/(app)/settings/actions.ts:198-202` | The `akinti_locale` cookie is set without `secure` and without `httpOnly`. | The value is enum-validated, so there is no injection and no open redirect, and it is not a credential — but it is read server-side on every request and there is no reason for script to read it or for it to travel over plain HTTP. | `secure: process.env.NODE_ENV === "production"`, `httpOnly: true`. |
| 29 | P2 | `src/app/(app)/w/[id]/OwnerInsights.tsx:26-36`; `src/components/create/PitchReport.tsx:109-111`; `scripts/worker.ts:665` | `isPitchScore` validates the five canonical fields but not `cents_trace`, which is then mapped through a division. Separately, `score_0_100` is written as `Number(body.score) || 0` with no clamp. | A `cents_trace` holding non-numbers produces `NaN` amplitudes fed straight into `Waveform`. Worker-controlled today so the likelihood is low, but this is the only jsonb column rendered without full validation and the guard is one line from being complete. A sidecar returning 150 renders 150 as a score out of 100. | Extend the guard to require an array of finite numbers, and clamp the score to 0..100 in the worker before writing. |
| 30 | P2 | `supabase/migrations/20260906110000_flow.sql:41`, `:29` | `flow_impressions.wave_id` is `references waves(id) on delete cascade` with no index on `wave_id` — the only index is `(user_id, seen_at desc)` and the PK is `(user_id, wave_id)`. | Every Wave deletion sequentially scans `flow_impressions` to find rows to cascade, and the table grows without bound (nothing prunes rows older than the 7-day exclusion window), so this gets slower forever. | Add `create index flow_impressions_wave_idx on public.flow_impressions (wave_id);` plus a scheduled sweep of rows older than about 30 days. |
| 31 | P2 | `supabase/migrations/20260906110000_flow.sql:328` | `cursor_slot` is always `v_slot + v_limit`, regardless of how many rows the page actually emitted. | When the invitation pool is exhausted or the ranked stream runs short, the slot counter still advances by the full limit, so the "every 8th absolute position" phase drifts away from what the reader actually saw, and the invitation offset skips invitations that were never shown. | Return `v_slot` plus the number of rows actually emitted, computed from the final select. |
| 32 | P2 | `supabase/migrations/20260905180000_delete_user_cascade.sql:46-49` | `messages.shared_wave_id` changed from `on delete set null` to `on delete cascade`. | The reasoning for the account-deletion case is sound and well evidenced, but the FK also fires on an ordinary `deleteWaveDetails`: deleting one of your own Waves now silently removes another person's message from their conversation, with no notice on either side. The header only analyses account deletion. | Keep the cascade, but state the ordinary-delete consequence in the header and in `docs/DATABASE.md`. A tombstone row would be better UX but needs `messages_payload_matches_kind` relaxed, which is a different change. |
| 33 | P2 | `next.config.ts:104` | `serverExternalPackages: ["iyzipay"]` is right for Turbopack, but `iyzipay/lib/Iyzipay.js` resolves its resources with `fs.readdirSync` over its own `lib/resources/` directory. | Next's file tracing follows static requires; a runtime directory read is invisible to it, so a Vercel deployment can ship `iyzipay` without `lib/resources/**` and fail at the first call with a runtime error rather than at build time. Nothing in the build output proves those files were traced. | Add `outputFileTracingIncludes` for the iyzico routes covering `./node_modules/iyzipay/lib/resources/**`, and confirm on a preview deployment before launch. |
| 34 | P2 | `.env.example`; `scripts/check-env.ts:33-38` | `.env.example` documents 24 variables; the code reads six more that are absent — `SIDECAR_URL`, `SIDECAR_TIMEOUT_MS`, `SIDECAR_RETRIES`, `SIDECAR_HOST`/`SIDECAR_PORT`, `RNNOISE_MODEL_PATH`, and `DATABASE_URL`/`SUPABASE_DB_URL` (which `npm run db:migrate` requires). `check-env` validates only the Supabase keys. | Without `SIDECAR_URL` the worker silently defaults to `http://127.0.0.1:8011`; on a separately-hosted worker that means every `pitch_snap`/`self_harmony` job fails and retries forever, because `worker.ts:786-790` deliberately gives those two no local fallback. A launch checklist built from `.env.example` misses it entirely. | Add the six to `.env.example`, and extend `check-env.ts` with modes that assert the billing, VAPID and sidecar groups are complete-or-absent rather than half-set. |
| 35 | P2 | `src/lib/validation/audio.ts:128-145` | `enqueueProcessingSchema` and `enqueueDuetMixSchema` are exported and referenced only from doc comments — nothing calls them. `enqueueAudioProcessing` (`src/lib/db/audioAssets.ts:213-225`) builds the job payload directly. | Two schemas that look like the validation boundary but are not, and the processing one's preset enum excludes the two Pro ids, which reads as if the bypass in finding 3 were already closed. Dead validation is worse than none because it misleads the next reader. | Either call them from `enqueueAudioProcessing`/`enqueueDuetMix` (which also narrows finding 3's server-side surface) or delete them. |
| 36 | P2 | `supabase/migrations/20260906100000_subscriptions.sql:183` | `grant execute on function public.has_pro(uuid) to anon`. | Any anonymous caller can probe the Pro status of an arbitrary user id. The Pro badge is public by design so the information is not secret, but `anon` does not need it (the badge renders server-side), and it hands an unauthenticated enumeration primitive to anyone holding a list of user ids. | Drop `anon` from the grant; keep `authenticated, service_role`. |

## Open questions (low confidence — surfaced, not blocking)

- **CSP and the payment providers (finding 2).** If production relaxes CSP at the Vercel or edge
  layer rather than in `next.config.ts`, finding 2 is a documentation gap rather than a blocker.
  Nothing in the repo suggests that, and `next.config.ts` is the only place a CSP is emitted, but
  it deserves a one-line confirmation from whoever owns the deploy before anyone spends time on it.
- **Web Audio and CORS (finding 5).** The mechanism is unambiguous in the spec and no `crossOrigin`
  assignment exists anywhere in `src/`, but `docs/qa/flow/` records 19 of 20 live checks passing,
  none of which appears to assert that sound was audible. If Flow was genuinely heard working on a
  real device against real Supabase Storage, the browsers involved are being more permissive than
  the spec requires and this drops to P2. Confirm by ear, not by screenshot.
- `src/components/create/PublishProgress.tsx:135` uses `bg-signal-deep`, which `globals.css:69`
  aliases to `--akinti-danger`. That resolves review2 finding 11 correctly, but the token name
  still says "signal" for a value that is not Signal, and `:67-68` documents the alias as
  deliberate rename-avoidance. Worth renaming once, or it will be re-flagged in every future
  review.
- `src/lib/audio/analyser.ts:41`, `:54` call `void context.resume()` without awaiting. If the
  context is created while suspended, the first frames may read silence even after finding 5 is
  fixed. Probably harmless because the graph is only built after a gesture, but it is the kind of
  thing that only appears on a slow phone.
- `src/app/api/billing/iyzico/callback/route.ts` has no signature and no CSRF token. It is
  defensible as written — the token is only useful against a `subscriptions` row that already
  exists, the real state is re-fetched from iyzico in the same request, and a second POST with the
  same token finds no pending row — so a replay cannot grant Pro. Flagged only because it is the
  one state-changing POST route in the app with no authentication of any kind, and that fact
  should be a deliberate, reviewed decision rather than an accident.

## review2 follow-up status

| review2 item | Status | Evidence |
|---|---|---|
| **P0 1** `challenge_entries`/`challenge_picks` missing `can_view_wave` | **Resolved** | `20260905150000_challenge_entries_visibility.sql:47`, `:61` add `and public.can_view_wave(wave_id)` to both policies, with a matching `down/` file (`b6053c8`). |
| **P1 2** account deletion leaves storage objects | **Resolved** | `src/lib/storage/userObjects.ts` (recursive list plus batched remove, backed by 172 lines in `userObjects.test.ts`), called from `settings/actions.ts:377-380` before `deleteUser` (`c354eb3`). See finding 21 for the ordering caveat and finding 6 for what deletion still misses. |
| **P1 3** atışma original plays outside the store | **Resolved** | `AtismaTurnRecorder.tsx:36`, `:66`, `:77` route the original through `usePlaybackStore()`/`useWaveControls`; the two raw `<audio ref>` elements are gone (`047716c`). |
| **P1 4** original keeps playing into the reply take | **Resolved** | `AtismaTurnRecorder.tsx:105`, `:156`, `:163`, `:192` all `store.pause()` on the phase change, including the defensive check on entering the recording phase. |
| **P1 5** `FALLBACK_PEAKS` fabricated waveform | **Resolved** | No `FALLBACK_PEAKS` remains anywhere in `src/` (`b408ef7`, `acb0af1`). |
| **P2 6/7** atışma concurrent `AudioContext`s and turn-range drift | Not re-verified | Outside this range's diff. Carried over rather than claimed fixed. |
| **P2 8** signed URLs expire with no refresh | **Resolved** | `src/lib/audio/signedAudioUrl.ts` (plus 76 lines of tests) and `playbackStore.ts:186-196` re-mint on staleness and on a media `error`, once per error so a genuinely broken asset still surfaces (`e836040`). |
| **P2 9/10** hashtag/create params unvalidated, `decodeURIComponent` can 500 | **Resolved** | `hashtag/[tag]/page.tsx:27-30` wraps the decode, `:39` and `:71` parse with `listWavesByHashtagSchema`, `:74` calls `notFound()` on failure (`cfc75b6`). |
| **P2 11** Signal plus infinite lamp on `PublishProgress` | **Resolved** | `PublishProgress.tsx:135` is now a static `bg-signal-deep` mark, which `globals.css:69` aliases to `--akinti-danger`; no `akinti-lamp`. See the open question about the token name. |
| **P2 12** centred create/onboarding layouts | **Resolved** | No `mx-auto max-w-xl` remains in `CreateFlow.tsx`; the remaining `items-center` uses in `OnboardingFlow.tsx` are on control rows, not page layout (`6a911ac`). |
| **P2 13/14** em dash and engineering copy in user strings | **Resolved** | Both strings are gone (`ea399d4`). `en.json:566` is now the single remaining em dash in either message file — finding 22. |
| **P2 15** `DeleteAccountSheet` has no `.catch()` | **Open** | `DeleteAccountSheet.tsx:42` is unchanged. Finding 24. |
| **P2 21** `next/dynamic` for recorder, DSP preview and wavesurfer | **Resolved** | `next/dynamic` now in `CreateFlow.tsx:24`, `DuetRecorder.tsx:22`, `FlowScreen.tsx:3`, `Composer.tsx:5`; `w/[id]/page.tsx:29-44` documents the two cases where it measurably did not help (`11f3ff8`). |
| **P2 22** 20 new pure modules with no unit test | **Resolved** | `trim.test.ts`, `wav.test.ts`, `recorderPlan.test.ts`, `pitch.test.ts`, `constraints.test.ts`, `playbackStore.test.ts`, `signedAudioUrl.test.ts` and more (`ebfcd4c`); the suite grew 641 to 834 tests. The coverage gap has moved to billing — finding 15. |
| **P2 23** `.qa-scratch/` untracked and unignored | **Open (moot today)** | The directory no longer exists and `git status` is clean, but `.gitignore` still has no entry for it. One line, still worth it. |
| reviewA carry-over: comment the pre-playback seek no-op | **Resolved** | `9d870ef docs(audio): explain the pre-playback seek no-op in Waveform.tsx`. |

## Launch-readiness checklist

### Environment variables

| Variable | Read at | Required? | In `.env.example`? |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/supabase/config.ts`; also `next.config.ts:30` to build the CSP | Yes | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase/admin.ts`, `scripts/worker.ts` | Yes | yes |
| `NEXT_PUBLIC_SITE_URL` | `src/app/sitemap.ts` (falls back to `VERCEL_URL`) | recommended | yes |
| `REQUIRE_SUPABASE` | `scripts/check-env.ts` | implied by `VERCEL` | yes |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `src/lib/push/send.ts:47-60` | push silently disabled unless all three are set | yes |
| `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL`, `IYZICO_MERCHANT_ID` | `src/lib/billing/iyzico.ts:55-57`, `:249-250` | Yes for TRY plans. `IYZICO_BASE_URL` must be set to the production host or it silently stays on sandbox | yes |
| `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_ENVIRONMENT` | `src/lib/billing/paddle.ts:45-52` | Yes for USD plans. Defaults to sandbox when unset | yes |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_ENVIRONMENT` | `settings/pro/page.tsx` into `ProScreen` | Yes for USD plans | yes |
| `IYZICO_PLAN_*`, `PADDLE_PRICE_*`, `*_AMOUNT` | `scripts/seed-plans.ts` | seeding only | yes |
| `SIDECAR_URL`, `SIDECAR_TIMEOUT_MS`, `SIDECAR_RETRIES` | `src/lib/audio/sidecarPipeline.ts:26-28` | Yes for the worker. Pro sounds hard-fail without a reachable sidecar | no (finding 34) |
| `SIDECAR_HOST`, `SIDECAR_PORT` | `scripts/run-sidecar.mjs` | sidecar host only | no |
| `RNNOISE_MODEL_PATH` | `scripts/worker.ts:97` | optional, bundled default | no |
| `DATABASE_URL` or `SUPABASE_DB_URL` | `scripts/apply-migrations.ts` | Yes, to migrate | no |
| `FFMPEG_PATH`, `FFPROBE_PATH`, `WORKER_POLL_INTERVAL_MS`, `WORKER_BATCH_SIZE` | `scripts/worker.ts` | worker, optional | yes |
| `QA_EMAIL`, `QA_PASSWORD` | `scripts/qa/*` | QA only, never production | no (correct) |

`scripts/check-env.ts` validates the Supabase group only. Nothing checks that the billing, VAPID
or sidecar groups are complete rather than half-set, and a half-set billing group fails at the
provider call rather than at boot.

### Migrations

Eight migration files land in this range, each with a matching `down/` file:
`20260905150000_challenge_entries_visibility`, `20260905160000_fix_direct_conversation_upsert`,
`20260905170000_push_subscriptions`, `20260905180000_delete_user_cascade`,
`20260906100000_subscriptions`, `20260906110000_flow`, `20260906120000_pro_presets_pitch`,
`20260906130000_profile_locale`. `scripts/apply-migrations.ts` tracks applied files in
`public.schema_migrations` and is safe to re-run, so the mechanism is sound.

Whether the live project is caught up cannot be determined from the repo. Run
`npm run db:migrate:dry` against production and confirm the pending list is empty before launch.

Two things must be settled before the Pro screen can transact at all:

1. **Finding 1's constraint collision must be fixed with a third migration.** As the files stand,
   applying them in order leaves `rate_limit_events_action_known` without `billing_checkout`, and
   every checkout fails after the provider has already been called.
2. **`plans` is created empty on purpose** (a good decision, argued in the migration header).
   Until `scripts/seed-plans.ts` runs with real iyzico pricing-plan reference codes and Paddle
   price ids, `startCheckout` fails with "This plan is not available right now"
   (`src/lib/billing/index.ts:85`). The two yearly plans additionally need their own
   `*_AMOUNT` set or they are skipped, and `hasSeededYearlyPlan` then hides the yearly toggle
   rather than guessing a price — correct behaviour, but it means the annual tier does not exist
   until the founder decides the discount.

`20260906120000_pro_presets_pitch.sql:48-49` uses `alter type ... add value` inside the
per-file transaction the runner wraps each migration in. That is legal on Postgres 12+ because
the migration never casts to the new values in the same transaction, and the header says so — worth
keeping in mind only if the runner is ever changed to batch files into one transaction.

### Hosting

- **Vercel (web).** All 45 routes are dynamic — `src/i18n/request.ts` reads `cookies()` and
  `headers()`, so nothing prerenders. No Edge runtime is declared anywhere (`NEXT_RUNTIME` is read,
  never set), so the Node-only imports (`node:crypto` in `iyzico.ts`, `web-push`, `pg`) are safe.
  No route handler touches `fs`. `serverExternalPackages: ["iyzipay"]` needs the tracing fix in
  finding 33. `public/sw.js` is generated by `serwist build` after `next build`, is correctly
  gitignored, and is deliberately excluded from the immutable cache headers.
- **Docker (worker).** `Dockerfile.worker` and `docker-compose.worker.yml` exist. The worker needs
  `SUPABASE_SERVICE_ROLE_KEY`, ffmpeg, and `SIDECAR_URL` pointing at the sidecar container; the
  `127.0.0.1:8011` default is only correct if the two share a network namespace.
- **Docker (sidecar).** `Dockerfile.sidecar` and `sidecar/`. The pitch-snap and harmony endpoints
  have no local fallback by design (`scripts/worker.ts:786-790`), so a sidecar outage turns every
  Pro job into a retry loop rather than a degraded result — deliberate, but it means sidecar
  uptime is now a paid-feature dependency and needs monitoring. The pitch-score call is correctly
  best-effort (`worker.ts:647-687`) and leaves the column null.
- **Service worker.** Precaches 91 URLs (74 JS, 2 wasm, icons, `/~offline`) with no authenticated
  HTML in the manifest, which is right. Runtime caching is the problem — finding 10. Registered as
  `{ type: "classic" }`, which matches what the `@serwist/cli` esbuild bundle actually emits, and
  the reasoning is written down at `src/app/layout.tsx:126-134`.

### Launch blockers

1. Finding 1 — the `rate_limit_events` constraint collision. No Pro checkout can complete.
2. Finding 2 — the CSP blocks both payment rails. No Pro checkout can even start.
3. Findings 3 and 4 — AKINTI Pro is bypassable from the browser in two independent ways.
4. Finding 5 — Flow, the default post-login screen, plays no sound.
5. Finding 6 — deleting an account leaves the subscription billing the card.

## What is good

- **`get_flow_page`'s security posture.** Choosing `SECURITY INVOKER` and then arguing for it —
  "every table it reads already has RLS that resolves correctly for the calling viewer ... no
  SECURITY DEFINER escape hatch to keep in sync with those policies" — is the right instinct and
  the right level of scepticism about definer functions. `record_flow_event` is the mirror image
  and equally well judged: definer, because it writes a table with no client write path, but it
  re-derives the viewer from `auth.uid()`, validates the kind against a closed list, re-checks
  `can_view_wave`, and rate-limits, in that order, before touching a row. There is no way to write
  an impression for another user, and no way to probe a Wave you cannot see.
- **The webhook idempotency design.** `billing_events` unique on `(provider, event_id)`, both
  routes verifying against the raw body before parsing anything, `no-store` on every response, a
  401 that does not say why, and `parseEvent` returning a null-status audit row for event types
  that are not state transitions. Finding 7 is a bug in the ordering, not in the design.
- **Honest refusals instead of guessed API calls.** `IyzicoProvider.resume`
  (`iyzico.ts:209-231`) writes down exactly which endpoint exists, exactly why the documentation
  does not support using it for this, and then throws a user-readable error rather than guessing —
  and `ProScreen` offers a new checkout directly below the Resume button for that case. The same
  discipline runs through `scripts/seed-plans.ts` (a plan with no real price id is skipped, never
  inserted with a placeholder), `plans` being created empty, `hasSeededYearlyPlan` hiding a tier
  rather than showing a guessed discount, and `pitch_score` staying null when the sidecar is down.
  This is the hardest habit to keep under deadline and it held all the way through Wave F.
- **The Web Audio "create once" discipline.** `analyser.ts`'s header names the actual constraint
  (`createMediaElementSource` throws on a second call for the same element) and structures the
  module around it, and `FlowTrace` drives the pulse with one `element.style` write per animation
  frame rather than a React render per frame, with `prefers-reduced-motion` stopping the loop
  entirely rather than merely slowing it. The CORS gap in finding 5 is a missing attribute, not a
  misunderstanding of the layer.
- **`userObjects.ts`.** The one place in this range where a tricky external API's real behaviour is
  written down before being used: `storage.list()` returning only immediate children, a nested
  directory arriving as a pseudo-entry with a null id, and the two buckets nesting to different
  depths — all documented, then handled with a single recursive walk and no bucket-specific
  branch, backed by 172 lines of tests that drive a fake bucket client.
- **The delete-cascade migration.** It names the failure, states that it was reproduced live, gives
  the exact two-account sequence that reproduces it, explains why the check constraint cannot
  simply be relaxed, and then changes the smallest thing that fixes it. That is what a bug-fix
  migration should read like.
- **Serwist adopted deliberately, not by template.** Choosing `serwist build` over
  `withSerwistInit` because a webpack plugin breaks Turbopack, and `{ type: "classic" }` because
  the CLI emits a global-scope script that would silently never activate as a module worker — both
  discovered, both fixed, both explained at the call site. Signed audio URLs, Supabase auth and raw
  Storage objects are explicitly `NetworkOnly`. The HTML caching gap in finding 10 is inherited
  from `defaultCache`, not authored here.
- **The i18n migration held its shape.** 1070 keys with perfect parity between `en.json` and
  `tr.json`, only 17 deliberately identical values (brand terms and mode names), zero exclamation
  marks in either file, one em dash left in 1338 lines, `<html lang>` wired to the resolved locale,
  and a ratchet that let a 450-file migration proceed without breaking `npm run lint` for every
  other agent working in the repo. Extracting `resolveLocale` purely so the precedence rule has a
  direct unit test is exactly the right seam, and `requireUser` reading suspension off the
  already-memoized profile rather than issuing its own query is a real saving that did not weaken
  the check — `suspended_until` is still mapped (`mappers.ts:84`) and still enforced.
- **`finalizeUpload` re-sniffs the magic bytes server-side** with the same pure function the client
  used, and reads the preset back from the row rather than trusting the request. Findings 3 and 4
  exist because the gate is in the wrong layer, not because the upload path is careless — that
  path is one of the more carefully argued pieces of code in the repository.
