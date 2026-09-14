"use client";

import {
  Bar,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatKwh } from "@/lib/energy/format";
import type { ScheduleRowView } from "@/lib/energy/optimization-service";

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

/**
 * Hourly recommended battery power (charge vs discharge) with the tariff
 * rate overlaid — makes the arbitrage story visible at a glance.
 */
export function ScheduleChart({
  data,
  currency,
}: {
  data: ScheduleRowView[];
  currency: string;
}) {
  return (
    <div
      className="h-72 w-full"
      role="img"
      aria-label="Recommended hourly battery schedule"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={axisStyle}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="power"
            tick={axisStyle}
            tickLine={false}
            width={52}
            label={{
              value: "kW",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 11, fill: "var(--color-muted-foreground)" },
            }}
          />
          <YAxis
            yAxisId="rate"
            orientation="right"
            tick={axisStyle}
            tickLine={false}
            width={44}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: unknown, name: unknown) =>
              name === "Tariff"
                ? formatCurrency(Number(value ?? 0), currency, 2)
                : formatKwh(Number(value ?? 0), 1).replace(" kWh", " kW")
            }
          />
          <ChartLegend />
          <Bar
            yAxisId="power"
            dataKey="chargePowerKw"
            name="Charge"
            fill="var(--color-chart-2)"
            radius={[3, 3, 0, 0]}
          />
          <Bar
            yAxisId="power"
            dataKey="dischargePowerKw"
            name="Discharge"
            fill="var(--color-chart-1)"
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="rate"
            type="stepAfter"
            dataKey="tariffRate"
            name="Tariff"
            stroke="var(--color-chart-4)"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
