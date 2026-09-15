import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BatteryLow,
  BellRing,
  CheckCircle2,
  RadioTower,
  ReceiptText,
  TrendingUp,
  Zap,
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
import {
  AddBillForm,
  DeleteBillButton,
  ResolveAlertButton,
  RunCheckButton,
} from "@/components/alerts/alert-controls";
import { createClient } from "@/lib/supabase/server";
import { getAlertsPageData } from "@/lib/energy/alert-service";
import { getBillAnalysis } from "@/lib/energy/bill-service";
import {
  billVerdictMessage,
  type BillVerdict,
} from "@/lib/energy/alert-engine";
import { formatCurrency, formatKwh } from "@/lib/energy/format";
import type { AlertSeverity } from "@/types/energy";

export const metadata = { title: "Alerts" };

interface AlertsPageProps {
  searchParams: Promise<{ system?: string }>;
}

const SEVERITY_STYLES: Record<AlertSeverity, { label: string; className: string }> = {
  info: { label: "Info", className: "bg-secondary text-secondary-foreground" },
  low: { label: "Low", className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  medium: { label: "Medium", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  high: { label: "High", className: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
  critical: { label: "Critical", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
};

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  solar_wastage: Zap,
  low_battery: BatteryLow,
  communication_gap: RadioTower,
  import_spike: TrendingUp,
  bill_over: ReceiptText,
};

function AlertRow({
  type,
  severity,
  message,
  createdAt,
  footer,
}: {
  type: string;
  severity: AlertSeverity;
  message: string;
  createdAt: string;
  footer?: React.ReactNode;
}) {
  const Icon = TYPE_ICONS[type] ?? BellRing;
  const badge = SEVERITY_STYLES[severity];
  return (
    <li className="flex items-start gap-3 border-b py-3 last:border-0">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}
          >
            {badge.label}
          </span>
          <time className="text-xs text-muted-foreground">
            {new Date(createdAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </div>
        <p className="mt-1 text-sm">{message}</p>
        {footer}
      </div>
    </li>
  );
}

function VerdictBadge({ verdict }: { verdict: BillVerdict }) {
  const map = {
    over: { label: "Over estimate", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
    within: { label: "Matches estimate", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
    under: { label: "Under estimate", className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  } as const;
  const style = map[verdict.status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.className}`}>
      {style.label}
    </span>
  );
}

export default async function AlertsPage({ searchParams }: AlertsPageProps) {
  const { system: requestedSystem } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: systems } = await supabase
    .from("energy_systems")
    .select("id, name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const systemList = systems ?? [];
  if (systemList.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Alerts</h1>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <div>
              <h2 className="text-lg font-semibold">No energy systems yet.</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Alerts watch your readings for wastage, low battery, import
                spikes, and communication gaps. Create a system or load the
                demo to start.
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

  const selected = systemList.find((s) => s.id === requestedSystem) ?? systemList[0];
  const { data: fullSystem } = await supabase
    .from("energy_systems")
    .select("*")
    .eq("id", selected.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!fullSystem) redirect("/systems");

  const data = await getAlertsPageData(supabase, fullSystem as never);
  const analyses = await getBillAnalysis(supabase, fullSystem as never);
  const symbol = data.system.currency === "INR" ? "₹" : data.system.currency;

  // Default the bill form to last month.
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultPeriod = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Alerts & bills</h1>
          <p className="mt-1 text-muted-foreground">
            {data.lastCheck
              ? `Last checked ${new Date(data.lastCheck).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · in-app notifications only.`
              : "No alert check has run for this system yet."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SystemSelector
            systems={systemList}
            selectedId={selected.id}
            basePath="/alerts"
          />
          <RunCheckButton systemId={selected.id} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Unresolved alerts
            {data.unresolved.length > 0 ? ` (${data.unresolved.length})` : ""}
          </CardTitle>
          <CardDescription>
            The daily check reviews the last 30 completed days: solar wastage,
            low battery, import spikes, and communication gaps.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.unresolved.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckCircle2 className="size-8 text-emerald-500" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Nothing unresolved — run the check after new data lands.
              </p>
            </div>
          ) : (
            <ul>
              {data.unresolved.map((alert) => (
                <AlertRow
                  key={alert.id}
                  type={alert.type}
                  severity={alert.severity}
                  message={alert.message}
                  createdAt={alert.created_at}
                  footer={
                    <div className="mt-2">
                      <ResolveAlertButton alertId={alert.id} resolve>
                        <CheckCircle2 aria-hidden="true" />
                        Mark resolved
                      </ResolveAlertButton>
                    </div>
                  }
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Electricity bill analyzer</CardTitle>
          <CardDescription>
            Enter a utility bill; UrjaOS re-derives what the grid import should
            have cost from your hourly readings and flags mismatches.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <AddBillForm
            systemId={selected.id}
            defaultPeriod={defaultPeriod}
            currencyLabel={symbol}
          />

          {analyses.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No bills entered yet for this system.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="sr-only">Bill analysis per billing month</caption>
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="pb-2 pr-4 font-medium">Month</th>
                    <th scope="col" className="pb-2 pr-4 text-right font-medium">Bill total</th>
                    <th scope="col" className="pb-2 pr-4 text-right font-medium">Est. from readings</th>
                    <th scope="col" className="pb-2 pr-4 text-right font-medium">Grid import</th>
                    <th scope="col" className="pb-2 pr-4 font-medium">Verdict</th>
                    <th scope="col" className="pb-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {analyses.map(({ bill, verdict, gridImportKwh, hasReadings }) => (
                    <tr key={bill.id} className="border-b align-top last:border-0">
                      <td className="py-3 pr-4 font-medium">{bill.billing_period}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {formatCurrency(bill.total_amount, data.system.currency)}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {hasReadings
                          ? formatCurrency(verdict.estimatedCost, data.system.currency)
                          : "—"}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {hasReadings ? formatKwh(gridImportKwh) : "—"}
                      </td>
                      <td className="py-3 pr-4">
                        {hasReadings ? (
                          <div className="space-y-1">
                            <VerdictBadge verdict={verdict} />
                            <p className="max-w-xs text-xs text-muted-foreground">
                              {billVerdictMessage(verdict, symbol, bill.billing_period)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            No readings for this month
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        <DeleteBillButton billId={bill.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground">
                Estimates value every import hour at your tariff — fixed and
                other charges on real bills explain most gaps. Verdicts allow
                ±10% tolerance.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {data.resolved.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <ul>
              {data.resolved.map((alert) => (
                <AlertRow
                  key={alert.id}
                  type={alert.type}
                  severity={alert.severity}
                  message={alert.message}
                  createdAt={alert.created_at}
                  footer={
                    <div className="mt-2 flex items-center gap-3">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        Resolved{" "}
                        {alert.resolved_at
                          ? new Date(alert.resolved_at).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                            })
                          : ""}
                      </span>
                      <ResolveAlertButton alertId={alert.id} resolve={false} variant="ghost">
                        Re-open
                      </ResolveAlertButton>
                    </div>
                  }
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
