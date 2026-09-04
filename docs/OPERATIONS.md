# AKINTI — Operations

Runbooks for keeping a deployed AKINTI healthy. Deployment itself (first
setup, env vars, buckets, rollback) is [`DEPLOYMENT.md`](DEPLOYMENT.md); this
document assumes that's already done and something needs attention on an
already-running system.

## Worker stuck jobs

**Normal case — nothing to do.** `scripts/worker.ts` runs
`requeue_stalled_audio_jobs(stall_after => '10 minutes')` from its own
maintenance loop roughly once a minute (see
[`AUDIO_ARCHITECTURE.md`](AUDIO_ARCHITECTURE.md#queue-mechanics)). Any job
stuck `processing` because a worker instance died mid-flight gets reset to
`pending` automatically and picked up on the next poll, as long as **some**
worker is running.

**When to intervene:**

1. **Check whether a worker is actually running at all** — no worker
   process means nothing claims jobs, and `requeue_stalled_audio_jobs` never
   even runs. Check the container/host it's deployed on
   ([`DEPLOYMENT.md`](DEPLOYMENT.md#3-worker-deployment)); a crash-looping
   container is the most common cause of a stuck queue.
2. **See how bad it is** (Supabase SQL editor or `psql`):

   ```sql
   select status, count(*), min(created_at), max(attempts)
   from audio_processing_jobs
   group by status;
   ```

3. **Force an immediate stall sweep** rather than waiting for the next
   worker poll:

   ```sql
   select public.requeue_stalled_audio_jobs('10 minutes');
   ```

4. **A job at `attempts >= max_attempts` (default 3) is `failed` for good** —
   `fail_audio_job` doesn't retry it further, and the linked `audio_assets`
   row is `processing_status = 'failed'` with a real `processing_error`
   message (never a faked "done"). Find these:

   ```sql
   select id, audio_asset_id, job_type, attempts, error, updated_at
   from audio_processing_jobs
   where status = 'failed'
   order by updated_at desc;
   ```

   The usual causes are a corrupt/mismatched upload (the error message says
   so directly — `sniffAudioKind` rejected it) or the worker's `ffmpeg`/
   `ffprobe` was missing or misconfigured (`FFMPEG_PATH`/`FFPROBE_PATH`) —
   check the worker's own logs around that job's `updated_at` for which.
   There is no "retry" UI for a permanently failed job today; the fix is to
   re-upload if the file itself was the problem, or manually re-enqueue via
   `select public.enqueue_audio_job(<audio_asset_id>, '<job_type>');` after
   fixing the worker environment.

5. **Diagnose "no ffmpeg" specifically:** `npx tsx scripts/worker.ts --dry-run`
   on the worker host prints the ffmpeg command each currently-pending job
   would run without touching storage/the queue — useful to confirm the
   filter graph is sane even when `ffmpeg` itself isn't installed yet.

## Expired Duet requests

**Normal case — nothing to do.** The same worker maintenance loop calls
`expire_duet_requests()` roughly once a minute, flipping any `PENDING`
request whose `expires_at` (14 days after creation, `docs/DUET_SPEC.md`) has
passed to `EXPIRED`. The app's own read paths already treat an
overdue-but-not-yet-swept row as expired for UI purposes, so a short delay
between "actually expired" and "the row says `EXPIRED`" is never
user-visible — this sweep is bookkeeping, not a live gate.

**When to intervene:** only if the worker has been down long enough that
you want the state cleaned up immediately (e.g. before running a report),
or you're validating the worker is healthy after a deploy:

```sql
select public.expire_duet_requests();

-- Sanity check: any PENDING row that should already be EXPIRED?
select id, wave_id, requester_id, expires_at
from duet_requests
where status = 'pending' and expires_at <= now();
```

## Storage cleanup for deleted Waves

Waves are **soft-deleted** (`waves.deleted_at` set, row kept —
`src/lib/db/waves.ts#deleteWave`) — this is deliberate (undelete/appeal
window, audit trail) but means the underlying `audio` bucket objects
(`original_path`/`processed_path`) are **not** removed automatically today.
There is no scheduled purge job in this codebase yet; treat this as a
periodic manual (or cron-scripted) task, not a bug:

1. **Find candidates** — soft-deleted long enough to be past any reasonable
   undelete window (adjust the interval to your product's policy; nothing
   in the schema enforces one):

   ```sql
   select w.id as wave_id, a.id as audio_asset_id, a.original_path, a.processed_path
   from waves w
   join audio_assets a on a.id = w.audio_asset_id
   where w.deleted_at is not null
     and w.deleted_at < now() - interval '30 days';
   ```

2. **Remove the storage objects** using the **admin (service-role) client**
   — the same one `mintSignedAudioUrl` uses — since the owner's own client
   cannot read `original_path`/`processed_path` back
   ([`AUDIO_ARCHITECTURE.md`](AUDIO_ARCHITECTURE.md#storage-security--column-level-lockdown-spec-33-migration-15)):

   ```ts
   const admin = createAdminClient(); // src/lib/supabase/admin.ts
   await admin.storage.from("audio").remove([originalPath, processedPath]);
   ```

3. **Decide whether to also hard-delete the rows.** `waves.audio_asset_id`
   references `audio_assets` with `on delete restrict`, so deleting the
   `audio_assets` row requires deleting (or already having deleted) the
   `waves` row first. Hard-deleting the `waves` row itself is a product
   decision (loses the audit trail a soft delete preserves) — if you do,
   double-check nothing else still points at that `audio_asset_id`
   (`messages.audio_asset_id` uses `on delete set null`, so a shared
   reference there degrades gracefully rather than blocking the delete, but
   confirm none is expected to still resolve).
4. **A future automated version of this belongs as a `pg_cron` job or a
   maintenance-loop addition in `scripts/worker.ts`**, not application code
   — flagged here as a known gap rather than built speculatively, per spec
   §44 rule 13 ("do not over-engineer MVP").

## Rotating keys / secrets

**`SUPABASE_SERVICE_ROLE_KEY` (highest priority — bypasses RLS entirely):**

1. Supabase dashboard → Project Settings → API → generate a new
   `service_role` key (this immediately invalidates the old one).
2. Update it everywhere it's set: Vercel env vars (Production + Preview),
   the worker host's secret store (Fly `fly secrets set`/Railway
   variables/`.env.local` for a VPS), and any local `.env.local`.
3. Redeploy the web app and restart the worker container so both pick up
   the new value — neither hot-reloads an env var change.
4. Old key stops working immediately once regenerated; there's no grace
   period, so do steps 2–3 promptly (a short window of worker downtime is
   preferable to leaving a compromised key active).

**`NEXT_PUBLIC_SUPABASE_ANON_KEY`:** lower urgency — RLS is the actual
protection, not secrecy of this key (it's shipped to every browser by
design) — but rotate the same way if the project itself is being
re-keyed (e.g. suspected key leak via a source other than the anon key
itself, or a Supabase-side incident).

**When to rotate:** the key appeared in a public commit/log, a former
collaborator's access should be revoked, or as routine hygiene per your own
security policy — nothing in this codebase expires these automatically.

## Backups

Supabase manages Postgres backups on paid plans (Point-in-Time Recovery on
Pro+, daily backups on lower tiers) — confirm your project's plan covers
what your recovery objectives need; the free tier has **no automated
backups**. For an extra manual snapshot before a risky migration or
maintenance operation:

```bash
# Full logical dump — safe to run against a live project, read-only.
pg_dump "$DATABASE_URL" -Fc -f "akinti-$(date +%Y%m%d).dump"

# Restore into a fresh/throwaway project to verify a dump is actually usable
# — an untested backup is not a backup. (Supabase gives every project an
# empty database already, so `createdb` itself is only needed against a
# plain self-managed Postgres restore target.)
pg_restore -d "$DATABASE_URL_RESTORE_TARGET" "akinti-20260101.dump"
```

Storage (the `audio`/`avatars` buckets) is not covered by `pg_dump` — it's
object storage, not part of Postgres. Supabase Storage doesn't currently
offer a built-in bucket export; for a full disaster-recovery copy, script
`storage.from(bucket).list()` + `download()` against the admin client and
mirror to an external object store. Not automated in this codebase today —
flagged as a gap, not silently assumed to be covered.

## Logs and metrics

No third-party observability backend is wired in yet — this is an honest
gap, not a hidden one:

- **App errors:** `src/app/error.tsx`/`global-error.tsx` both log via
  `console.error` today (Vercel captures stdout/stderr into its own Logs
  tab, searchable by deployment). `src/instrumentation.ts` is the seam for
  wiring a real APM (`onRequestError`, or `registerOTel` — see
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`)
  when one is chosen.
- **Product analytics:** `src/lib/metrics/analyticsSink.ts` is a deliberate,
  swappable seam (`console.debug` in development) for the Play/Replay/Save/
  Share/Comment/Follow/Duet events spec §40 asks for — `setAnalyticsSink()`
  is where a real destination plugs in.
- **Worker health:** the worker logs every claim/complete/fail to stdout;
  point your host's log drain (Fly.io logs, Railway logs, `docker logs -f`)
  wherever you already centralize logs. The queue-depth query in "Worker
  stuck jobs" above is the cheapest health signal until a real metrics
  pipeline exists — a rough SLO worth alerting on once you have one: `count(*)
  where status = 'pending' and created_at < now() - interval '5 minutes'`
  should stay near zero while a worker is healthy.

## Incident response: a private-Wave leak report

Someone reports that a private (`only_me`/`followers`) Wave is visible to
someone who shouldn't see it. Treat as a real security incident, not a
routine moderation report — a leak means an authorization bug, not just
bad content.

1. **Confirm it's real, not user confusion about visibility rules** —
   reproduce as the reporter would have: an unauthorized account hitting
   `GET /api/audio/[assetId]/url` or `/w/[id]` directly.
   `can_view_wave`/`can_view_audio_asset` (migration 10) are the single
   source of truth both RLS and the app call — check the Wave's actual
   `visibility`, `deleted_at`, `hidden_at`, and whether a block/follow edge
   the reporter expects is actually in the state they think it is.
2. **If it reproduces, this is a code/schema bug, not a one-off** — the
   moderation queue's `resolve_report(..., 'hide_wave')` (`/moderation`,
   `src/app/(app)/moderation/actions.ts`) immediately makes the Wave
   invisible to everyone except its creator and moderators as a stopgap
   (`waves.hidden_at`, migration 23) — use it to stop the bleeding while the
   underlying authorization bug is fixed, don't treat hiding it as the fix
   itself.
3. **Signed URLs already self-expire** (10 minutes,
   `SIGNED_AUDIO_URL_TTL_SECONDS`) — a URL that already leaked out has a
   short natural lifetime and cannot be individually revoked early (Supabase
   Storage signed URLs aren't revocable), so there's nothing further to do
   about a URL already shared beyond waiting out the TTL and fixing the
   authorization hole that let it be minted.
4. **Check for broader exposure**, not just the one reported case — the
   same predicate function drives every access path, so if
   `can_view_wave`/`can_view_audio_asset` is wrong, it's very likely wrong
   for more than one Wave. Re-run the private-content test scenarios in
   [`SECURITY.md`](SECURITY.md#security-test-scenarios-to-keep-passing-spec-46)
   against the fixed code before considering it closed.
5. **Fix at the source** — the predicate function in migration 10, never a
   band-aid in a single call site — and add the exact reproduction as a
   regression test before closing the incident (spec §44: never rewrite
   without reason, but a proven leak is reason enough, and it must not
   regress silently).
6. **After the fix ships**, resolve the report in `/moderation` with a note
   describing the root cause and the fix, and consider whether the Wave
   should stay hidden (creator's choice) or be restored to its original
   visibility.
