import { NextResponse, type NextRequest } from "next/server";

import { routes } from "@/config/routes";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * PKCE code exchange for every Supabase Auth email link (signup
 * confirmation, password reset) and, once configured, any OAuth provider —
 * `emailRedirectTo`/`redirectTo` in `src/app/(auth)/actions.ts` both point
 * here. `supabase/config.toml` allow-lists this exact path.
 *
 * A relative `next` is honoured (e.g. `/reset-password` for the password
 * reset link, `/onboarding` for signup confirmation); anything else falls
 * back to Home. This route never renders UI — a failed exchange redirects to
 * `/login` with an error flag rather than throwing (spec §38 — no silent
 * failures, but also no leaking Supabase internals to the URL).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next"));

  if (!isSupabaseConfigured() || !code) {
    return NextResponse.redirect(`${origin}${routes.login()}`);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}${routes.login()}?error=callback_failed`);
  }

  return NextResponse.redirect(`${origin}${next ?? routes.home()}`);
}

function sanitizeNext(value: string | null): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return undefined;
  }
  return value;
}
