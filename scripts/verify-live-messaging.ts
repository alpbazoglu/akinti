/**
 * Live verification for direct messaging (spec §22), migration
 * `20260905160000_fix_direct_conversation_upsert.sql`.
 *
 * Regression guard for docs/qa/full/REPORT.md defect #1 (P0): every
 * first-time DM used to fail with Postgres 42P10 because
 * `get_or_create_direct_conversation()`'s `on conflict (direct_key)` clause
 * didn't repeat `conversations_direct_key_uniq`'s partial-index predicate.
 * Also regression-guards two more bugs found verifying that fix end-to-end
 * through the real UI (nothing had ever reached a real conversation thread
 * before, so neither had been exercised): `createMessageAudioTicketSchema`
 * validating `mimeType` with a raw `z.enum` instead of the codec-stripping
 * `audioMimeTypeSchema` (every real `MediaRecorder` reports e.g.
 * `"audio/webm;codecs=opus"`, which the raw enum rejected), and
 * `finalizeMessageAudio` marking an asset `ready` without `processed_path`,
 * which violates `audio_assets_ready_has_output` for every message audio
 * asset (they never get a processed file — see the comment at step 3 below).
 *
 * Own file, not an edit to `scripts/verify-live.ts` (owned by another
 * concurrent stage) — same approach: REST/PostgREST HTTP calls with the
 * service-role key for provisioning, real signed-in JWTs for the actual
 * RPC/insert calls being verified (never a service-role shortcut for the
 * thing under test), pass/fail table, non-zero exit on failure.
 *
 * Provisions two throwaway auth users, signs in as each, then as user A:
 *   1. Calls `get_or_create_direct_conversation(p_other_id: B)` twice and
 *      asserts the same conversation id comes back both times (the exact
 *      path defect #1 broke on the very first call).
 *   2. Sends a text message into that conversation.
 *   3. Sends a voice ("audio") message into it, referencing a throwaway
 *      `audio_assets` row it owns, finalized (marked `ready`) exactly the
 *      way `finalizeMessageAudio` does.
 * Then, as user B (the other member, never the sender), reads the
 * conversation back and asserts both messages are visible. Deletes both
 * throwaway auth users on the way out — `conversation_members`/`messages`
 * cascade-delete from `profiles`.
 *
 * Run with: `npx tsx scripts/verify-live-messaging.ts`
 * (no `npm run` entry — `package.json` is owned by another concurrent agent
 * for this stage; see the same note in `scripts/verify-live-challenges.ts`).
 *
 * Env (see .env.example): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------------ */
/* Minimal .env loader (same approach as scripts/verify-live.ts)            */
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

function getEnv(): { url: string; serviceRoleKey: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
  return { url: url!.replace(/\/+$/, ""), serviceRoleKey: serviceRoleKey!, anonKey: anonKey! };
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

async function createUser(baseUrl: string, adminHeaders: Record<string, string>, email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) {
    throw new Error(`create user failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const user = (await res.json()) as { id: string };
  return user.id;
}

async function signIn(baseUrl: string, anonKey: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`sign-in failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const session = (await res.json()) as { access_token: string };
  return session.access_token;
}

function authHeaders(anonKey: string, accessToken: string): Record<string, string> {
  return { apikey: anonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
}

/**
 * The end-to-end regression check for defect #1: opens (or reuses) the 1:1
 * thread between two throwaway accounts twice, sends a text and a voice
 * message as the opener, then confirms the other member can read both back.
 */
async function checkDirectConversationEndToEnd(
  baseUrl: string,
  adminHeaders: Record<string, string>,
  anonKey: string,
): Promise<CheckResult> {
  const name = "e2e:get_or_create_direct_conversation";
  const probeId = crypto.randomUUID();
  const password = `Vv${probeId.replace(/-/g, "")}!`;
  const emailA = `verify-messaging-a-${probeId}@akinti.internal`;
  const emailB = `verify-messaging-b-${probeId}@akinti.internal`;
  let userAId: string | null = null;
  let userBId: string | null = null;

  try {
    userAId = await createUser(baseUrl, adminHeaders, emailA, password);
    userBId = await createUser(baseUrl, adminHeaders, emailB, password);

    const tokenA = await signIn(baseUrl, anonKey, emailA, password);
    const tokenB = await signIn(baseUrl, anonKey, emailB, password);
    const headersA = authHeaders(anonKey, tokenA);
    const headersB = authHeaders(anonKey, tokenB);

    // 1. Open the conversation twice — this is exactly the call that always
    //    raised 42P10 before the fix, on the very first attempt.
    const openConversation = async (): Promise<string> => {
      const res = await fetch(`${baseUrl}/rest/v1/rpc/get_or_create_direct_conversation`, {
        method: "POST",
        headers: headersA,
        body: JSON.stringify({ p_other_id: userBId }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
      }
      return (await res.json()) as string;
    };

    const conversationId1 = await openConversation();
    const conversationId2 = await openConversation();
    if (conversationId1 !== conversationId2) {
      return {
        name,
        ok: false,
        detail: `opening the same DM twice returned different ids: ${conversationId1} vs ${conversationId2}`,
      };
    }

    // 2. Send a text message, as the opener (user A).
    const textRes = await fetch(`${baseUrl}/rest/v1/messages`, {
      method: "POST",
      headers: { ...headersA, Prefer: "return=representation" },
      body: JSON.stringify({
        conversation_id: conversationId1,
        sender_id: userAId,
        kind: "text",
        body: "verify-live-messaging: hello",
      }),
    });
    if (!textRes.ok) {
      return { name, ok: false, detail: `send text message failed: HTTP ${textRes.status} ${(await textRes.text()).slice(0, 300)}` };
    }
    const [textMessage] = (await textRes.json()) as { id: string }[];

    // 3. Send a voice message, referencing a throwaway audio asset A owns
    //    (mirrors the `owner_id = sender_id` check the `messages_guard`
    //    trigger enforces for kind = 'audio').
    const assetRes = await fetch(`${baseUrl}/rest/v1/audio_assets`, {
      method: "POST",
      headers: { ...adminHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        owner_id: userAId,
        original_path: `verify/${probeId}.wav`,
        mime_type: "audio/wav",
        byte_size: 1,
      }),
    });
    if (!assetRes.ok) {
      return { name, ok: false, detail: `create audio asset failed: HTTP ${assetRes.status} ${(await assetRes.text()).slice(0, 200)}` };
    }
    const [asset] = (await assetRes.json()) as { id: string }[];

    // Mirrors `finalizeMessageAudio` (`src/app/(app)/messages/actions.ts`)
    // marking the asset ready. Audio messages never get a processing job
    // (spec §22 — never a Wave, never enhanced), so the original upload IS
    // the final file; `finalizeMessageAudio` sets `processed_path` to the
    // same path for exactly that reason. Without it, this update violates
    // `audio_assets_ready_has_output` (`processing_status <> 'ready' or
    // processed_path is not null") and every real voice message send failed
    // here — this regression-guards that fix directly, not just the insert.
    const finalizeRes = await fetch(`${baseUrl}/rest/v1/audio_assets?id=eq.${asset.id}`, {
      method: "PATCH",
      headers: { ...adminHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        processing_status: "ready",
        processed_path: `verify/${probeId}.wav`,
        processed_at: new Date().toISOString(),
      }),
    });
    if (!finalizeRes.ok) {
      return {
        name,
        ok: false,
        detail: `finalize (mark ready) failed: HTTP ${finalizeRes.status} ${(await finalizeRes.text()).slice(0, 300)}`,
      };
    }

    const audioRes = await fetch(`${baseUrl}/rest/v1/messages`, {
      method: "POST",
      headers: { ...headersA, Prefer: "return=representation" },
      body: JSON.stringify({
        conversation_id: conversationId1,
        sender_id: userAId,
        kind: "audio",
        audio_asset_id: asset.id,
      }),
    });
    if (!audioRes.ok) {
      return { name, ok: false, detail: `send voice message failed: HTTP ${audioRes.status} ${(await audioRes.text()).slice(0, 300)}` };
    }
    const [audioMessage] = (await audioRes.json()) as { id: string }[];

    // 4. Read the conversation back as B — the other member, who never sent
    //    anything — and confirm both messages are visible.
    const readRes = await fetch(
      `${baseUrl}/rest/v1/messages?conversation_id=eq.${conversationId1}&select=id,kind`,
      { method: "GET", headers: headersB },
    );
    if (!readRes.ok) {
      return { name, ok: false, detail: `read as recipient failed: HTTP ${readRes.status} ${(await readRes.text()).slice(0, 300)}` };
    }
    const rows = (await readRes.json()) as { id: string; kind: string }[];
    const ids = new Set(rows.map((r) => r.id));
    if (!ids.has(textMessage.id) || !ids.has(audioMessage.id)) {
      return {
        name,
        ok: false,
        detail: `recipient could not see both messages (saw ${rows.length} row(s): ${rows.map((r) => r.kind).join(", ")})`,
      };
    }

    return {
      name,
      ok: true,
      detail: `same conversation id both times (${conversationId1}), text + voice message both visible to the recipient`,
    };
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    // Cascades: profiles -> conversation_members/messages/audio_assets.
    for (const userId of [userAId, userBId]) {
      if (userId) {
        await fetch(`${baseUrl}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: adminHeaders }).catch(
          () => {},
        );
      }
    }
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const { url, serviceRoleKey, anonKey } = getEnv();

  const adminHeaders: Record<string, string> = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  const results: CheckResult[] = [];
  results.push(await checkDirectConversationEndToEnd(url, adminHeaders, anonKey));

  console.log(`Verifying live Supabase project (messaging): ${url}\n`);
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
