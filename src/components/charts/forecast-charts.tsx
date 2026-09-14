"use client";

import {
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
import type { ForecastTypeBlock } from "@/lib/energy/forecast-service";

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

interface PairedHour {
  label: string;
  predicted: number;
  actual: number;
}

/** Predicted vs actual line chart over evaluated forecast hours. */
export function PredictedVsActualChart({
  data,
  title,
}: {
  data: PairedHour[];
  title: string;
}) {
  return (
    <div className="h-64 w-full sm:h-72" role="img" aria-label={title}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={axisStyle}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis tick={axisStyle} tickLine={false} width={52} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: unknown) => formatKwh(Number(value ?? 0))}
          />
          <ChartLegend />
          <Line
            type="monotone"
            dataKey="predicted"
            name="Forecasted"
            stroke="var(--color-chart-1)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="Actual"
            stroke="var(--color-chart-3)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Upcoming predicted hours (next 12h) as an area-style line. */
export function UpcomingForecastChart({
  data,
  title,
  strokeColor,
}: {
  data: ForecastTypeBlock["upcoming"];
  title: string;
  strokeColor: string;
}) {
  return (
    <div className="h-56 w-full" role="img" aria-label={title}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} />
          <YAxis tick={axisStyle} tickLine={false} width={52} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: unknown) => formatKwh(Number(value ?? 0))}
          />
          <Line
            type="monotone"
            dataKey="predictedKwh"
            name="Forecast"
            stroke={strokeColor}
            strokeWidth={2}
            dot={{ r: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
