import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DemoSystemButton } from "@/components/systems/demo-system-button";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("user_id", user!.id)
    .single();

  const { count: systemCount } = await supabase
    .from("energy_systems")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user!.id);

  const firstName = profile?.full_name?.trim().split(" ")[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {firstName ? `Welcome, ${firstName}` : "Welcome to UrjaOS"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Your energy command center — live KPIs and charts arrive in the next
          phase.
        </p>
      </div>

      {systemCount === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <h2 className="text-lg font-semibold">No energy systems yet.</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Create your first system, or load the Factory Alpha demo with 30
              days of realistic data to explore UrjaOS instantly.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/systems/new">Create a system</Link>
              </Button>
              <DemoSystemButton />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                Session active
              </CardTitle>
              <CardDescription>
                Signed in as{" "}
                <span className="font-medium text-foreground">
                  {user?.email ?? "unknown"}
                </span>
                . Your session is verified server-side on every request.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {systemCount} system{systemCount === 1 ? "" : "s"} connected
              </CardTitle>
              <CardDescription>
                Generate simulated data from a system page to feed the
                dashboard, analytics, and forecasts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button size="sm" variant="outline" asChild>
                <Link href="/systems">
                  Manage systems
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Next up</CardTitle>
              <CardDescription>
                Live KPIs, energy flow, and charts land in Phase 5 — powered by
                your simulated data.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      )}
    </div>
  );
}
