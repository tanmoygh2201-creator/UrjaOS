import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SystemSelector } from "@/components/dashboard/system-selector";
import { RangeTabs } from "@/components/analytics/range-tabs";
import { AnalyticsKpis } from "@/components/analytics/analytics-kpis";
import {
  DailyCostChart,
  DailyEnergyChart,
} from "@/components/charts/analytics-charts";
import { createClient } from "@/lib/supabase/server";
import {
  getAnalyticsData,
  isAnalyticsRangeKey,
  type AnalyticsRangeKey,
} from "@/lib/energy/analytics-service";
import { formatCurrency, formatKwh, formatPercent } from "@/lib/energy/format";
import { formatDayLabel } from "@/lib/energy/time";
import { DemoSystemButton } from "@/components/systems/demo-system-button";

export const metadata = { title: "Analytics" };

interface AnalyticsPageProps {
  searchParams: Promise<{ system?: string; range?: string }>;
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const { system: requestedSystem, range: requestedRange } = await searchParams;
  const rangeKey: AnalyticsRangeKey = isAnalyticsRangeKey(requestedRange)
    ? requestedRange
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
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Analytics</h1>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <div>
              <h2 className="text-lg font-semibold">No energy systems yet.</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Analytics explains where your energy and money go. Create a system
                or load the Factory Alpha demo to explore.
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

  // ── Selected system (ownership-verified full row) ────────────────────────
  const selected =
    systemList.find((s) => s.id === requestedSystem) ?? systemList[0];
  const { data: fullSystem } = await supabase
    .from("energy_systems")
    .select("*")
    .eq("id", selected.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!fullSystem) redirect("/systems");

  const data = await getAnalyticsData(
    supabase,
    fullSystem as never,
    rangeKey
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Analytics</h1>
          <p className="mt-1 text-muted-foreground">
            {data.hasData
              ? `${data.rangeLabel} — ${formatDayLabel(data.fromDayKey!)} to ${formatDayLabel(data.toDayKey!)} · estimates based on your readings.`
              : `${data.rangeLabel} — no readings in this window yet.`}
          </p>
        </div>
        <SystemSelector
          systems={systemList}
          selectedId={selected.id}
          basePath="/analytics"
          extraParams={{ range: rangeKey }}
        />
      </div>

      <RangeTabs selected={rangeKey} systemId={selected.id} />

      {data.hasData ? (
        <>
          <AnalyticsKpis data={data} />

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daily energy</CardTitle>
                <CardDescription>
                  Solar, consumption, and grid import per day.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DailyEnergyChart data={data.daily} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daily cost & savings</CardTitle>
                <CardDescription>
                  Estimated grid cost vs estimated savings, valued at your tariff.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DailyCostChart
                  data={data.daily}
                  currency={data.system.currency}
                />
                <p className="mt-3 text-xs text-muted-foreground">
                  Savings are estimates valued at your tariff — not guarantees.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Efficiency & performance</CardTitle>
              <CardDescription>
                How effectively your system converts solar into value.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EfficiencyGrid data={data} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cost breakdown</CardTitle>
              <CardDescription>
                What you paid vs what solar and battery avoided — always estimates.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CostBreakdownTable data={data} />
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <AlertTriangle className="size-8 text-energy-amber" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold">
                No data in this range yet.
              </h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Generate simulated data for this system to unlock analytics, or
                pick a different range.
              </p>
            </div>
            <Button asChild>
              <Link href={`/systems/${selected.id}`}>Open simulator controls</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EfficiencyGrid({ data }: { data: NonNullable<Awaited<ReturnType<typeof getAnalyticsData>>> }) {
  const { metrics, totals } = data;
  const items = [
    {
      label: "Solar utilization",
      value: formatPercent(metrics.solarUtilizationPct),
      hint: "Share of consumption covered by solar + battery",
    },
    {
      label: "Self-consumption",
      value: formatPercent(metrics.selfConsumptionPct),
      hint: "Share of generated solar used on-site",
    },
    {
      label: "Grid dependency",
      value: formatPercent(metrics.gridDependencyPct),
      hint: "Share of consumption served by the grid",
    },
    {
      label: "Energy wastage",
      value: formatPercent(metrics.energyWastagePct),
      hint: "Share of generated solar exported",
    },
    {
      label: "Battery utilization",
      value: formatPercent(metrics.batteryUtilizationPct),
      hint: "Avg equivalent full cycles per day, % of one cycle",
    },
    {
      label: "Energy balance",
      value: formatKwh(totals.solarKwh + totals.gridImportKwh),
      hint: "Total energy in (solar + grid)",
    },
  ];
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-border/60 bg-card p-4"
        >
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-1.5">
            <span className="text-xl font-semibold tracking-tight tabular-nums">
              {item.value}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {item.hint}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function CostBreakdownTable({
  data,
}: {
  data: NonNullable<Awaited<ReturnType<typeof getAnalyticsData>>>;
}) {
  const { cost } = data;
  const symbol = data.system.currency;
  const rows = [
    {
      label: "Baseline (no solar, no battery)",
      value: cost.baselineCost,
      hint: "What full grid supply would have cost",
      emphasized: false,
    },
    {
      label: "Actual grid cost",
      value: cost.actualGridCost,
      hint: "What the grid actually charged for imports",
      emphasized: true,
    },
    {
      label: "Solar savings",
      value: cost.solarSavings,
      hint: "Grid energy solar avoided serving",
      emphasized: false,
    },
    {
      label: "Battery savings",
      value: cost.batterySavings,
      hint: "Grid energy battery discharge avoided serving",
      emphasized: false,
    },
    {
      label: "Estimated total savings",
      value: cost.estimatedSavings,
      hint: "Baseline − actual, valued at your tariff",
      emphasized: true,
    },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <caption className="sr-only">
          Estimated cost breakdown for the selected range
        </caption>
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="pb-2 pr-4 font-medium">Component</th>
            <th scope="col" className="pb-2 pr-4 text-right font-medium">Amount</th>
            <th scope="col" className="pb-2 font-medium">What it means</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b last:border-0">
              <td className="py-2.5 pr-4">
                <span className={row.emphasized ? "font-medium" : undefined}>
                  {row.label}
                </span>
              </td>
              <td className="py-2.5 pr-4 text-right tabular-nums">
                <span className={row.emphasized ? "font-semibold" : undefined}>
                  {formatCurrency(row.value, symbol)}
                </span>
              </td>
              <td className="py-2.5 text-xs text-muted-foreground">{row.hint}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted-foreground">
        Per-hour tariff pricing · Savings are estimates, not guarantees.
      </p>
    </div>
  );
}
