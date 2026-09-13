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

  const firstName = profile?.full_name?.trim().split(" ")[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {firstName ? `Welcome, ${firstName}` : "Welcome to UrjaOS"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Your energy command center is under construction — Phase 5 will bring
          the live dashboard.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
              Session active
            </CardTitle>
            <CardDescription>
              You are signed in as{" "}
              <span className="font-medium text-foreground">
                {user?.email ?? "unknown"}
              </span>
              . Your session is verified server-side on every request.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile connected</CardTitle>
            <CardDescription>
              Role:{" "}
              <span className="font-medium text-foreground">
                {profile?.role ?? "user"}
              </span>
              . Profile data is protected by Row Level Security — you can only
              ever read your own.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Next up</CardTitle>
            <CardDescription>
              Energy systems arrive in Phase 4. Until then, you can update your
              profile details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" variant="outline" asChild>
              <Link href="/settings">
                Open settings
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
