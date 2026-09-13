import { redirect } from "next/navigation";
import { AppHeader } from "@/components/dashboard/app-header";
import { createClient } from "@/lib/supabase/server";

/**
 * Layout for the protected (app) route group.
 *
 * Defense in depth: the proxy (src/proxy.ts) already blocks unauthenticated
 * requests, but this server-side check is the authoritative gate — pages in
 * this group never render without a verified session, even if the proxy
 * configuration changes.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch the display name from the profile (created by the DB trigger).
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .single();

  const userLabel = profile?.full_name?.trim() || user.email || "Account";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader userLabel={userLabel} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
