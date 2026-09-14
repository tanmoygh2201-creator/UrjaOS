import { BatteryCharging, Coins, Repeat, TrendingDown } from "lucide-react";
import { formatCurrency, formatKwh } from "@/lib/energy/format";
import type { OptimizationSummaryView } from "@/lib/energy/optimization-service";

interface OptimizationKpisProps {
  summary: OptimizationSummaryView;
  currency: string;
  horizonLabel: string;
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

/** KPI grid for the optimization plan (spec §37–38). */
export function OptimizationKpis({
  summary,
  currency,
  horizonLabel,
}: OptimizationKpisProps) {
  const savingPct =
    summary.baselineCost > 0
      ? Math.round((summary.expectedSaving / summary.baselineCost) * 1000) / 10
      : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        icon={<Coins className="size-4 text-primary" aria-hidden="true" />}
        accentClass="bg-primary/10"
        label="Expected saving"
        value={formatCurrency(summary.expectedSaving, currency, 0)}
        sub={`${savingPct}% vs no-battery baseline · ${horizonLabel.toLowerCase()}`}
      />
      <Kpi
        icon={<TrendingDown className="size-4 text-chart-4" aria-hidden="true" />}
        accentClass="bg-chart-4/10"
        label="Optimized grid cost"
        value={formatCurrency(summary.optimizedCost, currency, 0)}
        sub={`Baseline ${formatCurrency(summary.baselineCost, currency, 0)}`}
      />
      <Kpi
        icon={<BatteryCharging className="size-4 text-chart-2" aria-hidden="true" />}
        accentClass="bg-chart-2/10"
        label="Battery throughput"
        value={formatKwh(summary.totalDischargeKwh)}
        sub={`${formatKwh(summary.totalChargeKwh)} charged · ${formatKwh(summary.gridChargeKwh, 1)} from grid`}
      />
      <Kpi
        icon={<Repeat className="size-4 text-energy-amber" aria-hidden="true" />}
        accentClass="bg-energy-amber/10"
        label="Equivalent cycles"
        value={String(summary.equivalentCycles)}
        sub="Total discharge ÷ capacity — wear visibility"
      />
    </div>
  );
}
