import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components (browser).
 *
 * - Uses the public anon key (safe to expose — Row Level Security protects data).
 * - Session is stored in cookies so the server can read it too.
 *
 * Call this inside a component/handler, not at module top-level, so a missing
 * configuration fails only when Supabase is actually used.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
