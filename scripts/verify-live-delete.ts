/**
 * Live verification for account deletion (spec §25 "delete account"),
 * regression guard for migration `20260905180000_delete_user_cascade.sql`.
 *
 * Bug this guards: `messages.audio_asset_id` / `messages.shared_wave_id` /
 * `messages.duet_request_id` (migration 07) used to be `on delete set null`,
 * but `messages_payload_matches_kind` (same migration) requires the matching
 * column to be non-null for its `kind`. Deleting an account cascades away
 * anything IT owns (a Wave, an audio asset, a duet request); if some OTHER
 * account's still-existing message pointed at that thing (someone shared
 * your Wave into a DM, or was the other party to a duet request you sent),
 * Postgres's `on delete set null` immediately violated the check constraint
 * and aborted the whole account deletion. Reproduced directly against the
 * live project before the fix: account A published a Wave, account B shared
 * it into a DM thread with A (`kind = 'wave_share'`), and deleting A failed
 * with `check constraint "messages_payload_matches_kind"`.
 *
 * This script provisions ONE throwaway account (`subject`) with one of
 * every entity type the account-deletion path (`deleteAccount`,
 * `src/app/(app)/settings/actions.ts`) has to clean up — a Wave, a comment,
 * a text message, a voice message, a `wave_share` message SENT BY A SECOND
 * ACCOUNT referencing the subject's Wave (the exact regression shape above),
 * a duet request, a follow, two notifications (one where the subject is the
 * recipient, one where the subject is the actor) and a challenge entry —
 * plus real objects in both storage buckets under the subject's id. It then
 * runs the same two steps `deleteAccount` runs, in the same order (storage
 * cleanup via the Storage REST API, exactly what `deleteUserStorageObjects`
 * — `src/lib/storage/userObjects.ts` — does under the hood, then
 * `DELETE /auth/v1/admin/users/:id`, exactly what `admin.auth.admin.deleteUser`
 * calls), and asserts every row and every storage object tied to the subject
 * is gone afterward, with zero leftovers in either bucket.
 *
 * Own file, not an edit to `scripts/verify-live.ts` (owned by another
 * concurrent agent for this stage) — same approach as
 * `scripts/verify-live-messaging.ts` / `scripts/verify-live-challenges.ts`:
 * plain REST/PostgREST + Storage HTTP calls with the service-role key.
 *
 * Run with: `npx tsx scripts/verify-live-delete.ts`
 * (no `npm run` entry — `package.json` is owned by another concurrent agent
 * for this stage; see the same note in the sibling verify-live-*.ts files.)
 *
 * Env (see .env.example): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------------ */
/* Minimal .env loader (same approach as scripts/verify-live-messaging.ts)  */
/* ------------------------------------------------------------------------ */

function loadEnvFile(): void {
  for (const name of [".env.local", ".env"]) {
    const filePath = path.resolve(process.cwd(), name);
    if (!existsSync(filePath)) continue;
    const contents = readFileSync(filePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function getEnv(): { url: string; serviceRoleKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
  return { url: url!.replace(/\/+$/, ""), serviceRoleKey: serviceRoleKey! };
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

function printTable(results: CheckResult[]): void {
  const nameWidth = Math.max(4, ...results.map((r) => r.name.length));
  console.log(`${"CHECK".padEnd(nameWidth)}  STATUS  DETAIL`);
  for (const r of results) {
    const status = r.ok ? "PASS" : "FAIL";
    console.log(`${r.name.padEnd(nameWidth)}  ${status.padEnd(6)}  ${r.detail}`);
  }
}

/* ------------------------------------------------------------------------ */
/* REST helpers                                                             */
/* ------------------------------------------------------------------------ */

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${url} failed: HTTP ${res.status} ${(await res.text()).slice(0, 400)}`);
  }
  return res.json();
}

async function countRows(
  baseUrl: string,
  headers: Record<string, string>,
  table: string,
  query: string,
): Promise<number> {
  // HEAD + Prefer: count=exact with no `select` (defaults to `*`) works for
  // every table regardless of whether it has an `id` column — `follows` and
  // `conversation_members` are composite-primary-key tables with none.
  const res = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, {
    method: "HEAD",
    headers: { ...headers, Prefer: "count=exact" },
  });
  if (!res.ok) {
    throw new Error(`count ${table} failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const range = res.headers.get("content-range"); // "0-4/5" or "*/0"
  const total = range?.split("/")[1];
  return total ? Number.parseInt(total, 10) : 0;
}

/* ------------------------------------------------------------------------ */
/* Storage helpers — mirror src/lib/storage/userObjects.ts exactly, over    */
/* the same Storage REST endpoints the Supabase JS client itself calls      */
/* (POST .../object/list/<bucket>, POST .../object/<bucket>/<path>, DELETE  */
/* .../object/<bucket> with {prefixes}).                                    */
/* ------------------------------------------------------------------------ */

interface StorageEntry {
  name: string;
  id: string | null;
}

async function uploadObject(
  baseUrl: string,
  headers: Record<string, string>,
  bucket: string,
  objectPath: string,
  contentType: string,
  contents: string,
): Promise<void> {
  const res = await fetch(`${baseUrl}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": contentType },
    body: contents,
  });
  if (!res.ok) {
    throw new Error(`upload ${bucket}/${objectPath} failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
}

/** Recursive listing, same algorithm as `listObjectPathsRecursive`. */
async function listObjectPathsRecursive(
  baseUrl: string,
  headers: Record<string, string>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  const limit = 100;
  let offset = 0;

  for (;;) {
    const res = await fetch(`${baseUrl}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit, offset }),
    });
    if (!res.ok) {
      throw new Error(`list ${bucket}/${prefix} failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
    const data = (await res.json()) as StorageEntry[];
    if (data.length === 0) break;

    for (const entry of data) {
      const entryPath = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        paths.push(...(await listObjectPathsRecursive(baseUrl, headers, bucket, entryPath)));
      } else {
        paths.push(entryPath);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return paths;
}

/** Exactly `deleteUserStorageObjects`'s algorithm: list then batched remove. */
async function deleteUserStorageObjects(
  baseUrl: string,
  headers: Record<string, string>,
  bucket: string,
  userId: string,
): Promise<void> {
  const paths = await listObjectPathsRecursive(baseUrl, headers, bucket, userId);
  const batchSize = 100;
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize);
    const res = await fetch(`${baseUrl}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: batch }),
    });
    if (!res.ok) {
      throw new Error(`remove ${bucket} objects failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
  }
}

/* ------------------------------------------------------------------------ */
/* Main check                                                                */
/* ------------------------------------------------------------------------ */

async function checkAccountDeletion(baseUrl: string, adminHeaders: Record<string, string>): Promise<CheckResult> {
  const name = "e2e:delete-account-full-cleanup";
  const probeId = crypto.randomUUID();
  const password = `Vv${probeId.replace(/-/g, "")}!`;
  const subjectEmail = `verify-delete-subject-${probeId}@akinti.internal`;
  const otherEmail = `verify-delete-other-${probeId}@akinti.internal`;

  let subjectId: string | null = null;
  let otherId: string | null = null;
  let challengeId: string | null = null;

  try {
    // --- Provision two throwaway accounts -------------------------------
    const subject = (await postJson(`${baseUrl}/auth/v1/admin/users`, adminHeaders, {
      email: subjectEmail,
      password,
      email_confirm: true,
    })) as { id: string };
    subjectId = subject.id;

    const other = (await postJson(`${baseUrl}/auth/v1/admin/users`, adminHeaders, {
      email: otherEmail,
      password,
      email_confirm: true,
    })) as { id: string };
    otherId = other.id;

    // --- Storage objects under the subject's id, in both buckets --------
    const audioBytes = "RIFF-fake-wav-bytes-for-verify-live-delete";
    const avatarBytes = "fake-png-bytes-for-verify-live-delete";
    const audioAssetPathId = crypto.randomUUID();
    const audioObjectPath = `${subjectId}/${audioAssetPathId}/original.wav`;
    const avatarObjectPath = `${subjectId}/avatar.png`;
    await uploadObject(baseUrl, adminHeaders, "audio", audioObjectPath, "audio/wav", audioBytes);
    await uploadObject(baseUrl, adminHeaders, "avatars", avatarObjectPath, "image/png", avatarBytes);

    // --- Subject's own audio asset + Wave --------------------------------
    const [subjectAsset] = (await postJson(`${baseUrl}/rest/v1/audio_assets`, adminHeaders, {
      owner_id: subjectId,
      original_path: audioObjectPath,
      mime_type: "audio/wav",
      byte_size: audioBytes.length,
    })) as { id: string }[];

    const [subjectWave] = (await postJson(`${baseUrl}/rest/v1/waves`, adminHeaders, {
      creator_id: subjectId,
      audio_asset_id: subjectAsset.id,
      title: "verify-live-delete probe wave",
      creation_type: "recorded",
    })) as { id: string }[];

    // --- The other account's own Wave, used for the duet request --------
    const [otherAsset] = (await postJson(`${baseUrl}/rest/v1/audio_assets`, adminHeaders, {
      owner_id: otherId,
      original_path: `verify/${probeId}-other.wav`,
      mime_type: "audio/wav",
      byte_size: 1,
    })) as { id: string }[];

    const [otherWave] = (await postJson(`${baseUrl}/rest/v1/waves`, adminHeaders, {
      creator_id: otherId,
      audio_asset_id: otherAsset.id,
      title: "verify-live-delete probe other wave",
      creation_type: "recorded",
    })) as { id: string }[];

    // --- Comment authored by the subject ---------------------------------
    await postJson(`${baseUrl}/rest/v1/comments`, adminHeaders, {
      wave_id: otherWave.id,
      author_id: subjectId,
      body: "verify-live-delete: comment authored by the subject",
    });

    // --- Direct conversation + a text and a voice message from the subject
    const [conversation] = (await postJson(`${baseUrl}/rest/v1/conversations`, adminHeaders, {
      kind: "direct",
      created_by: subjectId,
      direct_key: `verify-delete-${probeId}`,
    })) as { id: string }[];

    await postJson(`${baseUrl}/rest/v1/conversation_members`, adminHeaders, [
      { conversation_id: conversation.id, profile_id: subjectId },
      { conversation_id: conversation.id, profile_id: otherId },
    ]);

    const [textMessage] = (await postJson(`${baseUrl}/rest/v1/messages`, adminHeaders, {
      conversation_id: conversation.id,
      sender_id: subjectId,
      kind: "text",
      body: "verify-live-delete: hello",
    })) as { id: string }[];

    const [voiceMessage] = (await postJson(`${baseUrl}/rest/v1/messages`, adminHeaders, {
      conversation_id: conversation.id,
      sender_id: subjectId,
      kind: "audio",
      audio_asset_id: subjectAsset.id,
    })) as { id: string }[];

    // --- The exact regression shape migration 32 fixes: the OTHER account
    // shares the SUBJECT's Wave into the same thread. Deleting the subject
    // cascades their Wave away, which used to try to null out this message
    // (sent by someone else, untouched by the subject's own deletion) and
    // violate messages_payload_matches_kind.
    const [waveShareMessage] = (await postJson(`${baseUrl}/rest/v1/messages`, adminHeaders, {
      conversation_id: conversation.id,
      sender_id: otherId,
      kind: "wave_share",
      shared_wave_id: subjectWave.id,
    })) as { id: string }[];

    // --- Duet request: subject requests a duet on the other account's Wave
    const [duetRequest] = (await postJson(`${baseUrl}/rest/v1/duet_requests`, adminHeaders, {
      wave_id: otherWave.id,
      requester_id: subjectId,
      recipient_id: otherId,
    })) as { id: string }[];

    // --- Follow: subject follows the other account -----------------------
    await postJson(`${baseUrl}/rest/v1/follows`, adminHeaders, {
      follower_id: subjectId,
      followee_id: otherId,
    });

    // --- Notifications: one where the subject is the recipient, one where
    // the subject is the actor — covers both cascade directions.
    await postJson(`${baseUrl}/rest/v1/notifications`, adminHeaders, {
      recipient_id: subjectId,
      actor_id: otherId,
      type: "follow",
      group_key: `verify-delete-follow-${probeId}`,
    });
    await postJson(`${baseUrl}/rest/v1/notifications`, adminHeaders, {
      recipient_id: otherId,
      actor_id: subjectId,
      type: "comment",
      group_key: `verify-delete-comment-${probeId}`,
    });

    // --- Challenge entry: subject's Wave entered into a throwaway live
    // challenge (service-role insert bypasses challenge_entries_guard's
    // own-wave/ownership check the same way scripts/verify-live-challenges.ts
    // does for its RLS-focused probe).
    const now = new Date();
    const [challenge] = (await postJson(`${baseUrl}/rest/v1/challenges`, adminHeaders, {
      slug: `verify-delete-${probeId.slice(0, 8)}`,
      title: "verify-live-delete probe challenge",
      brief: "throwaway challenge for verify-live-delete.ts",
      hashtag: `verifydelete${probeId.replace(/-/g, "").slice(0, 8)}`,
      starts_at: new Date(now.getTime() - 60_000).toISOString(),
      ends_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: "live",
    })) as { id: string }[];
    challengeId = challenge.id;

    await postJson(`${baseUrl}/rest/v1/challenge_entries`, adminHeaders, {
      challenge_id: challenge.id,
      wave_id: subjectWave.id,
      user_id: subjectId,
    });

    // --- Sanity: everything above actually landed before we delete anything
    const preCounts = {
      waves: await countRows(baseUrl, adminHeaders, "waves", `creator_id=eq.${subjectId}`),
      comments: await countRows(baseUrl, adminHeaders, "comments", `author_id=eq.${subjectId}`),
      messages: await countRows(baseUrl, adminHeaders, "messages", `sender_id=eq.${subjectId}`),
      waveShareMessage: await countRows(baseUrl, adminHeaders, "messages", `id=eq.${waveShareMessage.id}`),
      duetRequests: await countRows(baseUrl, adminHeaders, "duet_requests", `requester_id=eq.${subjectId}`),
      follows: await countRows(baseUrl, adminHeaders, "follows", `follower_id=eq.${subjectId}`),
      notifications: await countRows(
        baseUrl,
        adminHeaders,
        "notifications",
        `or=(recipient_id.eq.${subjectId},actor_id.eq.${subjectId})`,
      ),
      challengeEntries: await countRows(baseUrl, adminHeaders, "challenge_entries", `user_id=eq.${subjectId}`),
    };
    const missing = Object.entries(preCounts).filter(([, n]) => n < 1);
    if (missing.length > 0) {
      return {
        name,
        ok: false,
        detail: `setup incomplete before delete — zero rows for: ${missing.map(([k]) => k).join(", ")}`,
      };
    }

    // --- The real deleteAccount path (settings/actions.ts): storage cleanup
    // for BOTH buckets first, then auth.admin.deleteUser. Mirrors
    // deleteUserStorageObjects/deleteAccount exactly, over the equivalent
    // HTTP endpoints the Supabase JS client itself calls.
    await deleteUserStorageObjects(baseUrl, adminHeaders, "audio", subjectId);
    await deleteUserStorageObjects(baseUrl, adminHeaders, "avatars", subjectId);

    const deleteRes = await fetch(`${baseUrl}/auth/v1/admin/users/${subjectId}`, {
      method: "DELETE",
      headers: adminHeaders,
    });
    if (!deleteRes.ok) {
      return {
        name,
        ok: false,
        detail: `deleteUser failed: HTTP ${deleteRes.status} ${(await deleteRes.text()).slice(0, 500)}`,
      };
    }

    // --- Assert: no leftover rows anywhere tied to the subject ------------
    const postCounts = {
      profile: await countRows(baseUrl, adminHeaders, "profiles", `id=eq.${subjectId}`),
      waves: await countRows(baseUrl, adminHeaders, "waves", `creator_id=eq.${subjectId}`),
      comments: await countRows(baseUrl, adminHeaders, "comments", `author_id=eq.${subjectId}`),
      messages: await countRows(baseUrl, adminHeaders, "messages", `sender_id=eq.${subjectId}`),
      // The regression: the OTHER account's wave_share message must be gone
      // too, since its payload (the subject's Wave) is gone.
      waveShareMessage: await countRows(baseUrl, adminHeaders, "messages", `id=eq.${waveShareMessage.id}`),
      textMessage: await countRows(baseUrl, adminHeaders, "messages", `id=eq.${textMessage.id}`),
      voiceMessage: await countRows(baseUrl, adminHeaders, "messages", `id=eq.${voiceMessage.id}`),
      duetRequests: await countRows(
        baseUrl,
        adminHeaders,
        "duet_requests",
        `or=(requester_id.eq.${subjectId},recipient_id.eq.${subjectId})`,
      ),
      duetRequestRow: await countRows(baseUrl, adminHeaders, "duet_requests", `id=eq.${duetRequest.id}`),
      follows: await countRows(baseUrl, adminHeaders, "follows", `follower_id=eq.${subjectId}`),
      notifications: await countRows(
        baseUrl,
        adminHeaders,
        "notifications",
        `or=(recipient_id.eq.${subjectId},actor_id.eq.${subjectId})`,
      ),
      challengeEntries: await countRows(baseUrl, adminHeaders, "challenge_entries", `user_id=eq.${subjectId}`),
      audioAssets: await countRows(baseUrl, adminHeaders, "audio_assets", `owner_id=eq.${subjectId}`),
      conversationMembers: await countRows(
        baseUrl,
        adminHeaders,
        "conversation_members",
        `profile_id=eq.${subjectId}`,
      ),
    };
    const leftovers = Object.entries(postCounts).filter(([, n]) => n > 0);

    const audioObjectsLeft = await listObjectPathsRecursive(baseUrl, adminHeaders, "audio", subjectId);
    const avatarObjectsLeft = await listObjectPathsRecursive(baseUrl, adminHeaders, "avatars", subjectId);

    if (leftovers.length > 0 || audioObjectsLeft.length > 0 || avatarObjectsLeft.length > 0) {
      const parts: string[] = [];
      if (leftovers.length > 0) parts.push(`leftover rows: ${leftovers.map(([k, n]) => `${k}=${n}`).join(", ")}`);
      if (audioObjectsLeft.length > 0) parts.push(`leftover audio objects: ${audioObjectsLeft.join(", ")}`);
      if (avatarObjectsLeft.length > 0) parts.push(`leftover avatar objects: ${avatarObjectsLeft.join(", ")}`);
      return { name, ok: false, detail: parts.join("; ") };
    }

    return {
      name,
      ok: true,
      detail:
        "waves, comments, messages (text + voice + the other account's wave_share), duet request, follow, " +
        "both notifications and the challenge entry all gone; both storage buckets empty under the subject's id",
    };
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    // subjectId is normally already gone via the delete call under test;
    // this only fires if the test failed before/at that step.
    if (subjectId) {
      await fetch(`${baseUrl}/auth/v1/admin/users/${subjectId}`, { method: "DELETE", headers: adminHeaders }).catch(
        () => {},
      );
    }
    if (otherId) {
      await fetch(`${baseUrl}/auth/v1/admin/users/${otherId}`, { method: "DELETE", headers: adminHeaders }).catch(
        () => {},
      );
    }
    if (challengeId) {
      await fetch(`${baseUrl}/rest/v1/challenges?id=eq.${challengeId}`, {
        method: "DELETE",
        headers: adminHeaders,
      }).catch(() => {});
    }
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const { url, serviceRoleKey } = getEnv();

  const adminHeaders: Record<string, string> = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  const results: CheckResult[] = [];
  results.push(await checkAccountDeletion(url, adminHeaders));

  console.log(`Verifying live Supabase project (account deletion): ${url}\n`);
  printTable(results);

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${results.length} checks passed.`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
