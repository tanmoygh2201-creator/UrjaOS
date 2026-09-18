import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleAlert,
  Download,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SystemSelector } from "@/components/dashboard/system-selector";
import { DemoSystemButton } from "@/components/systems/demo-system-button";
import { PeriodTabs } from "@/components/reports/period-tabs";
import { PrintButton } from "@/components/reports/print-button";
import { createClient } from "@/lib/supabase/server";
import {
  getReportData,
  isReportPeriodKey,
  type ReportDelta,
  type ReportInsight,
} from "@/lib/energy/report-service";
import {
  formatCurrency,
  formatKwh,
  formatPercent,
  getCurrencySymbol,
} from "@/lib/energy/format";

export const metadata = { title: "Reports" };

interface ReportsPageProps {
  searchParams: Promise<{ system?: string; period?: string }>;
}

/** Delta cell: current vs previous period, with arrow when a baseline exists. */
function DeltaCell({
  label,
  delta,
  format,
}: {
  label: string;
  delta: ReportDelta;
  format: (value: number) => string;
}) {
  const { changePct } = delta;
  const hasBaseline = changePct !== null;
  const up = hasBaseline && changePct >= 0;
  return (
    <div className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-semibold">{format(delta.current)}</span>
        {hasBaseline ? (
          <span
            className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium ${
              up ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
            }`}
          >
            {up ? "▲" : "▼"} {Math.abs(changePct)}% vs prev.
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">no previous data</span>
        )}
      </p>
    </div>
  );
}

/** One summary cell in the report grid. */
function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

const INSIGHT_STYLES: Record<
  ReportInsight["severity"],
  { icon: typeof Info; classes: string }
> = {
  positive: { icon: CheckCircle2, classes: "border-primary/30 bg-primary/5" },
  warning: { icon: AlertTriangle, classes: "border-amber-500/30 bg-amber-500/5" },
  critical: { icon: CircleAlert, classes: "border-destructive/30 bg-destructive/5" },
  neutral: { icon: Info, classes: "border-border/60 bg-muted/40" },
};

/** Insights ranked by buildReportInsights; severity determines color + icon. */
function InsightList({ insights }: { insights: ReportInsight[] }) {
  return (
    <ul className="space-y-3">
      {insights.map((insight) => {
        const style = INSIGHT_STYLES[insight.severity];
        const Icon = style.icon;
        return (
          <li
            key={insight.title}
            className={`rounded-xl border p-4 ${style.classes}`}
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {insight.title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{insight.detail}</p>
          </li>
        );
      })}
    </ul>
  );
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const { system: requestedSystem, period: requestedPeriod } = await searchParams;
  const periodKey = isReportPeriodKey(requestedPeriod)
    ? requestedPeriod
    : "monthly";

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
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Reports</h1>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <div>
              <h2 className="text-lg font-semibold">No energy systems yet.</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Reports summarize energy, cost and forecast accuracy over daily,
                weekly or monthly windows. Create a system or load the Factory
                Alpha demo to explore.
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

  const report = await getReportData(supabase, fullSystem as never, periodKey);
  const currency = report.system.currency;
  const symbol = getCurrencySymbol(currency);
  const exportHref = `/api/reports/export?systemId=${selected.id}&period=${periodKey}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Periodic summaries of energy, cost and performance — {report.periodLabel.toLowerCase()}{" "}
            window ending today.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <SystemSelector
            systems={systemList}
            selectedId={selected.id}
            basePath="/reports"
            extraParams={{ period: periodKey }}
          />
          <PeriodTabs selected={periodKey} systemId={selected.id} />
          <Button asChild variant="outline">
            <a href={exportHref} download>
              <Download className="size-4" aria-hidden="true" />
              CSV
            </a>
          </Button>
          <PrintButton />
        </div>
      </div>

      {report.hasData ? (
        <>
          <p className="text-xs text-muted-foreground">
            Window: {report.window.label} · Generated{" "}
            {new Date(report.generatedAt).toLocaleString()} · All costs and
            savings are tariff-valued estimates, not guarantees.
          </p>

          {/* ── Period-over-period deltas + headline metrics ───────────── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DeltaCell
              label="Solar generation"
              delta={report.deltas.solar}
              format={(v) => formatKwh(v)}
            />
            <DeltaCell
              label="Consumption"
              delta={report.deltas.consumption}
              format={(v) => formatKwh(v)}
            />
            <DeltaCell
              label="Grid import cost (est.)"
              delta={report.deltas.gridCost}
              format={(v) => formatCurrency(v, currency)}
            />
            <DeltaCell
              label="Estimated savings"
              delta={report.deltas.estimatedSavings}
              format={(v) => formatCurrency(v, currency)}
            />
            <SummaryCell
              label="Self-consumption"
              value={formatPercent(report.metrics.selfConsumptionPct, 1)}
            />
            <SummaryCell
              label="Solar utilization"
              value={formatPercent(report.metrics.solarUtilizationPct, 1)}
            />
          </div>

          {/* ── What to do next ────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>What to do next</CardTitle>
              <CardDescription>
                Plain-language findings from this period&apos;s data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InsightList insights={report.insights} />
            </CardContent>
          </Card>

          {/* ── Totals + cost breakdown ────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Energy totals</CardTitle>
                <CardDescription>{report.totals.daysWithData} day(s) with data</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {(
                    [
                      ["Solar generated", formatKwh(report.totals.solarKwh)],
                      ["Consumption", formatKwh(report.totals.consumptionKwh)],
                      ["Grid import", formatKwh(report.totals.gridImportKwh)],
                      ["Grid export", formatKwh(report.totals.gridExportKwh)],
                      ["Battery charged", formatKwh(report.totals.batteryChargeKwh)],
                      ["Battery discharged", formatKwh(report.totals.batteryDischargeKwh)],
                      ["Peak demand", `${report.totals.peakDemandKw.toFixed(2)} kW`],
                      ["Average demand", `${report.totals.avgDemandKw.toFixed(2)} kW`],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-2">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Cost breakdown (estimates)</CardTitle>
                <CardDescription>
                  Tariff-valued per hour — {symbol} figures are estimates, not guarantees.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm">
                  {(
                    [
                      ["Baseline (no solar/battery)", formatCurrency(report.cost.baselineCost, currency)],
                      ["Actual grid cost (est.)", formatCurrency(report.cost.actualGridCost, currency)],
                      ["Solar savings (est.)", formatCurrency(report.cost.solarSavings, currency)],
                      ["Battery savings (est.)", formatCurrency(report.cost.batterySavings, currency)],
                      ["Total estimated savings", formatCurrency(report.cost.estimatedSavings, currency)],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-2">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </div>

          {/* ── Daily breakdown table ──────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Daily breakdown</CardTitle>
              <CardDescription>
                Every local day in the window with recorded data.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">Day</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Solar</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Load</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Import</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Cost (est.)</th>
                    <th scope="col" className="py-2 text-right font-medium">Savings (est.)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.daily.map((d) => (
                    <tr key={d.day} className="border-b border-border/40 last:border-0">
                      <td className="py-2 pr-3">{d.label}</td>
                      <td className="py-2 pr-3 text-right">{formatKwh(d.solarKwh)}</td>
                      <td className="py-2 pr-3 text-right">{formatKwh(d.consumptionKwh)}</td>
                      <td className="py-2 pr-3 text-right">{formatKwh(d.gridImportKwh)}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(d.cost, currency)}</td>
                      <td className="py-2 text-right">{formatCurrency(d.savings, currency, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* ── Forecast accuracy + alerts ─────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Forecast accuracy</CardTitle>
                <CardDescription>
                  Measured over evaluated hours in this window.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {report.forecast ? (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-muted-foreground capitalize">{report.forecast.type} MAE</dt>
                      <dd className="font-medium">{report.forecast.mae} kWh</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-muted-foreground">MAPE</dt>
                      <dd className="font-medium">{report.forecast.mape}%</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-muted-foreground">Grade</dt>
                      <dd className="font-medium capitalize">{report.forecast.grade}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-muted-foreground">Evaluated hours</dt>
                      <dd className="font-medium">{report.forecast.samples}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No evaluated forecasts in this window yet — generate forecasts
                    from the Forecasting page and revisit after the predicted
                    hours pass.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Alerts</CardTitle>
                <CardDescription>Current state and this window&apos;s raises.</CardDescription>
              </CardHeader>
              <CardContent>
                {report.alerts.raisedInPeriod.length > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {report.alerts.raisedInPeriod.map((alert, index) => (
                      <li key={`${alert.created_at}-${index}`} className="flex items-start gap-2">
                        <span className="mt-0.5 size-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                        <span>
                          {alert.message}
                          {!alert.is_resolved && (
                            <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                              open
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No alerts were raised in this window.
                  </p>
                )}
                {report.alerts.openCount > 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {report.alerts.openCount} unresolved alert
                    {report.alerts.openCount === 1 ? "" : "s"} in total
                    {report.alerts.criticalCount > 0
                      ? ` (including ${report.alerts.criticalCount} high-severity)`
                      : ""}
                    .{" "}
                    <Link href="/alerts" className="font-medium text-primary underline underline-offset-4">
                      Review on the Alerts page
                    </Link>
                    .
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-secondary">
              <BarChart3 className="size-6 text-primary" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">No data in this window.</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                {report.system.name} has no readings between{" "}
                {report.window.fromDayKey} and {report.window.toDayKey}. Try a
                longer period, or generate simulation data from the system page.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
