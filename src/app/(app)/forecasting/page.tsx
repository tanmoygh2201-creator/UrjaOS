import Link from "next/link";
import { redirect } from "next/navigation";
import { CloudSun, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SystemSelector } from "@/components/dashboard/system-selector";
import { ForecastControls } from "@/components/forecasting/forecast-controls";
import { AccuracyCards } from "@/components/forecasting/accuracy-cards";
import {
  PredictedVsActualChart,
  UpcomingForecastChart,
} from "@/components/charts/forecast-charts";
import { createClient } from "@/lib/supabase/server";
import {
  getForecastPageData,
  isForecastHorizonKey,
} from "@/lib/energy/forecast-service";
import { formatKwh } from "@/lib/energy/format";
import { DemoSystemButton } from "@/components/systems/demo-system-button";

export const metadata = { title: "Forecasting" };

interface ForecastingPageProps {
  searchParams: Promise<{ system?: string; horizon?: string }>;
}

export default async function ForecastingPage({
  searchParams,
}: ForecastingPageProps) {
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
          Forecasting
        </h1>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <div>
              <h2 className="text-lg font-semibold">No energy systems yet.</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Forecasting learns from your readings. Create a system or load
                the Factory Alpha demo to explore.
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

  const data = await getForecastPageData(
    supabase,
    fullSystem as never,
    horizonKey
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Forecasting
          </h1>
          <p className="mt-1 text-muted-foreground">
            {data.hasForecasts
              ? `${data.horizonLabel} · learned from your last 21 days · model ${data.modelVersion}`
              : `${data.horizonLabel} · no forecasts yet for this system`}
          </p>
        </div>
        <SystemSelector
          systems={systemList}
          selectedId={selected.id}
          basePath="/forecasting"
          extraParams={{ horizon: horizonKey }}
        />
      </div>

      <ForecastControls selected={horizonKey} systemId={selected.id} />

      {data.hasForecasts ? (
        <>
          <AccuracyCards solar={data.solar} consumption={data.consumption} />

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Solar — predicted vs actual
                </CardTitle>
                <CardDescription>
                  Forecasted vs metered hourly energy over evaluated hours.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.solar.evaluatedSeries.length > 0 ? (
                  <PredictedVsActualChart
                    data={data.solar.evaluatedSeries}
                    title="Solar predicted vs actual"
                  />
                ) : (
                  <EmptyChartNote text="The predicted-vs-actual line appears once forecast hours pass and actuals are backfilled." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Consumption — predicted vs actual
                </CardTitle>
                <CardDescription>
                  Forecasted vs metered hourly energy over evaluated hours.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.consumption.evaluatedSeries.length > 0 ? (
                  <PredictedVsActualChart
                    data={data.consumption.evaluatedSeries}
                    title="Consumption predicted vs actual"
                  />
                ) : (
                  <EmptyChartNote text="The predicted-vs-actual line appears once forecast hours pass and actuals are backfilled." />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Next hours — solar</CardTitle>
                <CardDescription>
                  {formatKwh(data.solar.horizonTotalKwh)} predicted over the{" "}
                  {data.horizonLabel.toLowerCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UpcomingForecastChart
                  data={data.solar.upcoming}
                  title="Upcoming solar forecast"
                  strokeColor="var(--color-chart-1)"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Next hours — consumption
                </CardTitle>
                <CardDescription>
                  {formatKwh(data.consumption.horizonTotalKwh)} predicted over
                  the {data.horizonLabel.toLowerCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UpcomingForecastChart
                  data={data.consumption.upcoming}
                  title="Upcoming consumption forecast"
                  strokeColor="var(--color-chart-3)"
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                How accuracy is measured
              </CardTitle>
              <CardDescription>
                Every number here is measured from your data — never assumed
                (spec §34).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard
                  title="MAE"
                  body="Mean absolute error — on average, how many kWh each hourly forecast missed by."
                />
                <MetricCard
                  title="RMSE"
                  body="Root mean squared error — like MAE, but large misses are punished harder."
                />
                <MetricCard
                  title="MAPE"
                  body="Mean absolute percentage error — error relative to size, ignoring zero-actual hours (night)."
                />
              </div>
              {data.pendingActuals > 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {data.pendingActuals} past forecast hours are waiting for
                  actual readings — generate or refresh to backfill them.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <CloudSun className="size-8 text-energy-amber" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold">No forecasts yet.</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Generate a forecast to learn your solar and consumption
                patterns from the last 21 days of readings.
              </p>
            </div>
            <Button asChild>
              <Link href={`/systems/${selected.id}`}>
                Open simulator controls
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EmptyChartNote({ text }: { text: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 text-center">
      <Info className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="max-w-sm px-4 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function MetricCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}
