import {
  BatteryCharging,
  CircleDollarSign,
  PlugZap,
  Sun,
  Zap,
} from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  formatCurrency,
  formatKwh,
  formatPercent,
} from "@/lib/energy/format";
import type { DashboardKpis } from "@/lib/energy/dashboard-service";

interface KpiCardsProps {
  kpis: DashboardKpis;
  currency: string;
}

export function KpiCards({ kpis, currency }: KpiCardsProps) {
  const cards = [
    {
      key: "solar",
      label: "Solar generation",
      value: formatKwh(kpis.solarKwh),
      icon: Sun,
      tone: "text-energy-amber",
      sub: `${formatPercent(kpis.selfConsumptionPct, 1)} self-consumed`,
    },
    {
      key: "consumption",
      label: "Consumption",
      value: formatKwh(kpis.consumptionKwh),
      icon: Zap,
      tone: "text-energy-blue",
      sub: `${formatPercent(kpis.gridDependencyPct, 1)} from grid`,
    },
    {
      key: "battery",
      label: "Battery SOC",
      value: kpis.latestSoc !== null ? formatPercent(kpis.latestSoc) : "—",
      icon: BatteryCharging,
      tone: "text-energy-green",
      sub: `${formatKwh(kpis.batteryDischargeKwh)} discharged`,
    },
    {
      key: "grid",
      label: "Grid import",
      value: formatKwh(kpis.gridImportKwh),
      icon: PlugZap,
      tone: "text-chart-4",
      sub: `${formatKwh(kpis.gridExportKwh)} exported`,
    },
    {
      key: "savings",
      label: "Estimated savings",
      value: formatCurrency(kpis.savings, currency, 0),
      icon: CircleDollarSign,
      tone: "text-primary",
      sub: `Grid cost ${formatCurrency(kpis.cost, currency, 0)}`,
    },
  ];

  return (
    <section aria-label="Key metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.key}>
          <CardContent className="space-y-1.5">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className={`flex size-6 items-center justify-center rounded-md bg-muted ${card.tone}`}>
                <card.icon className="size-3.5" aria-hidden="true" />
              </span>
              {card.label}
            </p>
            <p className="text-2xl font-bold tabular-nums tracking-tight">
              {card.value}
            </p>
            <p className="text-xs text-muted-foreground">{card.sub}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
