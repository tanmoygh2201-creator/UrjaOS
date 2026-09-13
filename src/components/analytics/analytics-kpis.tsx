import { BatteryCharging, Coins, PlugZap, Sun, Zap } from "lucide-react";
import {
  formatCurrency,
  formatKwh,
  formatKw,
  formatPercent,
} from "@/lib/energy/format";
import type { AnalyticsData } from "@/lib/energy/analytics-service";

interface AnalyticsKpisProps {
  data: AnalyticsData;
}

function Kpi({
  icon,
  label,
  value,
  sub,
  accentClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accentClass: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className={`flex size-7 items-center justify-center rounded-lg ${accentClass}`}>
          {icon}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

/** KPI grid for the analytics page (spec §29). */
export function AnalyticsKpis({ data }: AnalyticsKpisProps) {
  const { totals, metrics, cost } = data;
  const symbol = data.system.currency;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Kpi
        icon={<Sun className="size-4 text-energy-amber" aria-hidden="true" />}
        accentClass="bg-energy-amber/10"
        label="Solar generated"
        value={formatKwh(totals.solarKwh)}
        sub={`${formatPercent(metrics.selfConsumptionPct)} self-consumed`}
      />
      <Kpi
        icon={<Zap className="size-4 text-chart-3" aria-hidden="true" />}
        accentClass="bg-chart-3/10"
        label="Consumption"
        value={formatKwh(totals.consumptionKwh)}
        sub={`Peak ${formatKw(totals.peakDemandKw, 1)} · avg ${formatKw(totals.avgDemandKw, 1)}`}
      />
      <Kpi
        icon={<PlugZap className="size-4 text-chart-4" aria-hidden="true" />}
        accentClass="bg-chart-4/10"
        label="Grid import"
        value={formatKwh(totals.gridImportKwh)}
        sub={`${formatPercent(metrics.gridDependencyPct)} dependency · ${formatKwh(totals.gridExportKwh)} exported`}
      />
      <Kpi
        icon={
          <BatteryCharging className="size-4 text-chart-2" aria-hidden="true" />
        }
        accentClass="bg-chart-2/10"
        label="Battery discharged"
        value={formatKwh(totals.batteryDischargeKwh)}
        sub={`${formatPercent(metrics.batteryUtilizationPct)} utilization`}
      />
      <Kpi
        icon={<Coins className="size-4 text-primary" aria-hidden="true" />}
        accentClass="bg-primary/10"
        label="Estimated savings"
        value={formatCurrency(metrics.estimatedSavings, symbol, 0)}
        sub={`Grid cost ${formatCurrency(cost.actualGridCost, symbol, 0)}`}
      />
    </div>
  );
}
