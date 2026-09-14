import Link from "next/link";
import { redirect } from "next/navigation";
import { CloudSun, Info, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SystemSelector } from "@/components/dashboard/system-selector";
import { OptimizationControls } from "@/components/battery/optimization-controls";
import { OptimizationKpis } from "@/components/battery/optimization-kpis";
import { ScheduleChart } from "@/components/charts/optimization-charts";
import { ScheduleTable } from "@/components/battery/schedule-table";
import { createClient } from "@/lib/supabase/server";
import {
  getOptimizationPageData,
} from "@/lib/energy/optimization-service";
import { isForecastHorizonKey } from "@/lib/energy/forecast-service";
import { formatCurrency } from "@/lib/energy/format";
import { DemoSystemButton } from "@/components/systems/demo-system-button";

export const metadata = { title: "Battery" };

interface BatteryPageProps {
  searchParams: Promise<{ system?: string; horizon?: string }>;
}

export default async function BatteryPage({ searchParams }: BatteryPageProps) {
  const { system: requestedSystem, horizon: requestedHorizon } =
    await searchParams;
  const horizonKey = isForecastHorizonKey(requestedHorizon)
    ? requestedHorizon
    : "7d";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── Systems (owned only) ────────────────────────────────────────────────
  const { data: systems } = await supabase
    .from("energy_systems")
    .select("id, name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const systemList = systems ?? [];
  if (systemList.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Battery optimization
        </h1>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <div>
              <h2 className="text-lg font-semibold">No energy systems yet.</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                The optimizer plans battery charge/discharge around your tariff.
                Create a system or load the Factory Alpha demo to explore.
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

  // ── Selected system ────────────────────────────────────────────────────
  const selected =
    systemList.find((s) => s.id === requestedSystem) ?? systemList[0];
  const { data: fullSystem } = await supabase
    .from("energy_systems")
    .select("*")
    .eq("id", selected.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!fullSystem) redirect("/systems");

  const data = await getOptimizationPageData(
    supabase,
    fullSystem as never,
    horizonKey
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Battery optimization
          </h1>
          <p className="mt-1 text-muted-foreground">
            {data.horizonLabel} · {data.modelLabel}
          </p>
        </div>
        <SystemSelector
          systems={systemList}
          selectedId={selected.id}
          basePath="/battery"
          extraParams={{ horizon: horizonKey }}
        />
      </div>

      {!data.hasBattery ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <ShieldAlert className="size-8 text-energy-amber" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold">
                This system has no battery.
              </h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Add battery capacity in the system settings to unlock
                charge/discharge planning.
              </p>
            </div>
            <Button asChild>
              <Link href={`/systems/${selected.id}/edit`}>Edit system</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <OptimizationControls selected={horizonKey} systemId={selected.id} />

          {data.hasPlan ? (
            <>
              <OptimizationKpis
                summary={data.summary}
                currency={data.system.currency}
                horizonLabel={data.horizonLabel}
              />

              {!data.summary.arbitrageEnabled ? (
                <Card>
                  <CardContent className="flex items-start gap-3 py-4">
                    <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">
                      Your tariff has little or no price variation, so battery
                      arbitrage would not pay: the optimal plan is the
                      no-battery baseline (solar direct use only). Expected
                      savings are exactly {formatCurrency(0, data.system.currency, 0)}.
                    </p>
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Recommended hourly schedule
                  </CardTitle>
                  <CardDescription>
                    Battery power vs tariff — charge cheap, discharge at peak.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScheduleChart data={data.schedule} currency={data.system.currency} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Hourly plan</CardTitle>
                  <CardDescription>
                    Simulation output — a recommendation, not a device command.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScheduleTable schedule={data.schedule} currency={data.system.currency} />
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                <CloudSun className="size-8 text-energy-amber" aria-hidden="true" />
                <div>
                  <h2 className="text-lg font-semibold">No schedule yet.</h2>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                    {data.hasForecasts
                      ? "Run the optimizer to plan your battery around upcoming prices."
                      : "The optimizer needs forecasts first — generate one on the Forecasting page, then run it here."}
                  </p>
                </div>
                <Button asChild variant={data.hasForecasts ? "default" : "outline"}>
                  <Link href="/forecasting">Open forecasting</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
