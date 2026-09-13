"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatKwh } from "@/lib/energy/format";
import type { DailyAnalyticsPoint } from "@/lib/energy/analytics-service";

const axisStyle = { fontSize: 11, fill: "var(--color-muted-foreground)" };
const gridStroke = "var(--color-border)";
const tooltipStyle = {
  backgroundColor: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  fontSize: "12px",
  color: "var(--color-popover-foreground)",
};

function ChartLegend() {
  return (
    <Legend
      wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
      iconType="circle"
      iconSize={8}
    />
  );
}

/** Daily solar / consumption / grid import bars over the selected range. */
export function DailyEnergyChart({ data }: { data: DailyAnalyticsPoint[] }) {
  return (
    <div className="h-64 w-full sm:h-72" role="img" aria-label="Daily energy chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={axisStyle} tickLine={false} width={48} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value: unknown) => formatKwh(Number(value ?? 0))} />
          <ChartLegend />
          <Bar dataKey="solarKwh" name="Solar (kWh)" fill="var(--color-chart-1)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="consumptionKwh" name="Consumption (kWh)" fill="var(--color-chart-3)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="gridImportKwh" name="Grid import (kWh)" fill="var(--color-chart-4)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Daily estimated grid cost bars with estimated savings line. */
export function DailyCostChart({
  data,
  currency,
}: {
  data: DailyAnalyticsPoint[];
  currency: string;
}) {
  return (
    <div className="h-64 w-full sm:h-72" role="img" aria-label="Daily cost chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={axisStyle} tickLine={false} width={56} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: unknown) => formatCurrency(Number(value ?? 0), currency, 0)}
          />
          <ChartLegend />
          <Line
            type="monotone"
            dataKey="cost"
            name="Grid cost"
            stroke="var(--color-chart-4)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="savings"
            name="Estimated savings"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
