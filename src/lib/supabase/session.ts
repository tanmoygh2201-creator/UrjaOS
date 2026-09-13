import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export interface SessionUpdateResult {
  response: NextResponse;
  /** Authenticated user, or null when signed out / token unverifiable. */
  user: { id: string; email?: string | null } | null;
}

/**
 * Refreshes the Supabase auth session cookies on every matched request and
 * verifies the user. Called from `src/proxy.ts` on each navigation.
 *
 * Security notes:
 * - The access token is verified server-side by `auth.getUser()` — we never
 *   trust the mere presence of a cookie as "logged in".
 * - On verification failure we clear the stale cookies (fail closed) so a
 *   broken session can never keep granting access.
 */
export async function updateSession(request: NextRequest): Promise<SessionUpdateResult> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user: SessionUpdateResult["user"] = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      user = { id: data.user.id, email: data.user.email };
    }
  } catch {
    // Network/service failure — treat as signed out (fail closed).
    user = null;
  }

  if (!user) {
    const stale = request.cookies.getAll().filter((c) =>
      c.name.startsWith("sb-")
    );
    for (const cookie of stale) {
      response.cookies.delete(cookie.name);
    }
  }

  return { response, user };
}
