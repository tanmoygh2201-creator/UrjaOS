import { redirect } from "next/navigation";
import { AuthHeader } from "@/components/auth/auth-header";
import { createClient } from "@/lib/supabase/server";

/**
 * Layout for the (auth) route group: centered card on a subtle branded
 * background. Authenticated users are sent to the dashboard.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-secondary/50 to-background px-4 py-16">
      <AuthHeader />
      {children}
    </div>
  );
}
