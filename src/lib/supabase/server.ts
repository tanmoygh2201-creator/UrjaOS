import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 *
 * - Reads/writes the session cookie through Next.js `cookies()` so auth state
 *   stays in sync between browser and server.
 * - Cookie writes are skipped inside Server Components (read-only context);
 *   middleware and Route Handlers handle the writes.
 *
 * Always call this inside a request scope — never at module top-level.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore because
            // middleware refreshes sessions on navigation.
          }
        },
      },
    }
  );
}
