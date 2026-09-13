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
import { formatKwh } from "@/lib/energy/format";
import type { DailyPoint, HourlyFlowPoint } from "@/lib/energy/dashboard-service";

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

/** Hourly solar vs consumption with battery SOC overlay (latest day). */
export function HourlyEnergyChart({ data }: { data: HourlyFlowPoint[] }) {
  return (
    <div className="h-64 w-full sm:h-72" role="img" aria-label="Hourly energy chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={axisStyle} tickLine={false} width={44} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: unknown, name: unknown) =>
              name === "SOC"
                ? `${Number(value ?? 0)}%`
                : formatKwh(Number(value ?? 0))
            }
          />
          <ChartLegend />
          <Line
            type="monotone"
            dataKey="solarKwh"
            name="Solar (kWh)"
            stroke="var(--color-chart-1)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="consumptionKwh"
            name="Consumption (kWh)"
            stroke="var(--color-chart-3)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="soc"
            name="SOC"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            dot={false}
            unit="%"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Battery charge/discharge bars per hour (latest day). */
export function BatteryPowerChart({ data }: { data: HourlyFlowPoint[] }) {
  return (
    <div className="h-56 w-full sm:h-64" role="img" aria-label="Battery power chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={axisStyle} tickLine={false} width={44} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value: unknown) => formatKwh(Number(value ?? 0))} />
          <ChartLegend />
          <Bar dataKey="batteryChargeKwh" name="Charged (kWh)" fill="var(--color-chart-2)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="batteryDischargeKwh" name="Discharged (kWh)" fill="var(--color-chart-5)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Daily solar / consumption / import bars with savings line (7 days). */
export function DailyOverviewChart({ data }: { data: DailyPoint[] }) {
  return (
    <div className="h-64 w-full sm:h-72" role="img" aria-label="Daily energy overview chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} />
          <YAxis tick={axisStyle} tickLine={false} width={44} />
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
