/**
 * Deployment health probe.
 *
 * Reports only WHETHER each required environment variable is present —
 * never its value. Route Handlers sit outside the proxy matcher, so this
 * endpoint answers even when the proxy itself is failing, which makes it
 * the fastest way to tell "missing env vars" from "broken code" on a
 * fresh deployment.
 */
export const dynamic = "force-dynamic";

const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "AI_PROVIDER",
  "AI_API_KEY",
] as const;

export async function GET() {
  return Response.json(
    {
      ok: true,
      env: Object.fromEntries(
        REQUIRED_ENV_VARS.map((name) => [name, Boolean(process.env[name])])
      ),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
