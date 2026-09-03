import { NextResponse, type NextRequest } from "next/server";

import { mintPlaybackUrl } from "@/lib/db/audioAssets";
import { NotFoundError } from "@/lib/db/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * `GET /api/audio/[assetId]/url` — the ONLY way a browser ever learns a
 * playable audio URL (spec §33). Cookie-authenticated, RLS-checked: mints a
 * short-lived signed URL for `processed_path` once ready, falling back to
 * `original_path` while the Wave is still processing (`mintPlaybackUrl`,
 * `src/lib/db/audioAssets.ts`).
 *
 * Always 404 on any authorization failure, never 403 — existence and
 * visibility are deliberately indistinguishable everywhere else in this
 * codebase (see `src/lib/db/waves.ts`'s doc comment on the same rule); a 403
 * here would itself leak that a private asset exists.
 */

interface RouteContext {
  params: Promise<{ assetId: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export async function GET(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { assetId } = await context.params;

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "not_configured", message: "Audio playback is not available: the backend is not configured." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  if (!UUID_RE.test(assetId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE_HEADERS });
  }

  try {
    const db = await createServerSupabaseClient();
    const admin = createAdminClient();
    const playback = await mintPlaybackUrl(db, admin, assetId);

    return NextResponse.json(
      { url: playback.url, expiresAt: playback.expiresAt, variant: playback.variant },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE_HEADERS });
    }
    console.error("[api/audio/[assetId]/url]", err);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
