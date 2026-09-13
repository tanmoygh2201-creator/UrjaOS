import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { EnergyFlow } from "@/components/dashboard/energy-flow";
import { SystemSelector } from "@/components/dashboard/system-selector";
import {
  BatteryPowerChart,
  DailyOverviewChart,
  HourlyEnergyChart,
} from "@/components/charts/dashboard-charts";
import { createClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/energy/dashboard-service";
import { DemoSystemButton } from "@/components/systems/demo-system-button";
import { formatDayLabel } from "@/lib/energy/time";

export const metadata = { title: "Dashboard" };

interface DashboardPageProps {
  searchParams: Promise<{ system?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { system: requestedSystem } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── Systems (owned only) ─────────────────────────────────────────────
  const { data: systems } = await supabase
    .from("energy_systems")
    .select("id, name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const systemList = systems ?? [];

  if (systemList.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-secondary">
              <BarChart3 className="size-6 text-primary" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">No energy systems yet.</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Create your first system, or load the Factory Alpha demo with 30
                days of realistic data to explore the dashboard instantly.
              </p>
            </div>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/systems/new">Create a system</Link>
              </Button>
              <DemoSystemButton />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Pick the requested (or first) system, verifying ownership ────────
  const selected =
    systemList.find((s) => s.id === requestedSystem) ?? systemList[0];

  const { data: fullSystem } = await supabase
    .from("energy_systems")
    .select("*")
    .eq("id", selected.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!fullSystem) redirect("/systems");

  const data = await getDashboardData(
    supabase,
    fullSystem as never
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            {data
              ? `Energy overview for ${formatDayLabel(data.latestDayKey)} — estimates based on your readings.`
              : "Live energy overview."}
          </p>
        </div>
        <SystemSelector
          systems={systemList}
          selectedId={selected.id}
        />
      </div>

      {data === null ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <AlertTriangle
              className="size-8 text-energy-amber"
              aria-hidden="true"
            />
            <div>
              <h2 className="text-lg font-semibold">
                No monitoring data for this system yet.
              </h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Generate simulated data to see the dashboard in action — the
                simulator produces realistic solar, consumption, battery, and
                grid readings without any hardware.
              </p>
            </div>
            <Button asChild>
              <Link href={`/systems/${selected.id}`}>
                Open simulator controls
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <KpiCards kpis={data.kpis} currency={data.system.currency} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Energy flow</CardTitle>
              <CardDescription>
                Where yesterday&rsquo;s energy came from and where it went.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EnergyFlow totals={data.totals} latestSoc={data.kpis.latestSoc} />
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Hourly energy — {formatDayLabel(data.latestDayKey)}
                </CardTitle>
                <CardDescription>
                  Solar vs consumption with battery state of charge.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <HourlyEnergyChart data={data.hourly} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Battery activity</CardTitle>
                <CardDescription>
                  Charge and discharge energy per hour.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BatteryPowerChart data={data.hourly} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Last 7 days</CardTitle>
              <CardDescription>
                Daily generation, consumption, and grid import with estimated
                savings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DailyOverviewChart data={data.daily} />
              <p className="mt-3 text-xs text-muted-foreground">
                Savings are estimates valued at your tariff — not guarantees.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
