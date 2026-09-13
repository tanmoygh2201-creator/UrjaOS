import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeRedirect } from "@/lib/auth/redirect";

/**
 * Auth callback — Supabase redirects here after email verification links.
 * Exchanges the one-time code for a session cookie, then continues to the
 * requested page (or the dashboard).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = sanitizeRedirect(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Missing/invalid code — send back to login with a generic flag.
  return NextResponse.redirect(`${origin}/login?error=invalid_link`);
}
