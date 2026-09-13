import { formatKwh, formatPercent } from "@/lib/energy/format";
import type { FlowTotals } from "@/lib/energy/dashboard-service";

interface EnergyFlowProps {
  totals: FlowTotals;
  latestSoc: number | null;
}

/**
 * Interactive energy-flow diagram (spec §25).
 *
 * Pure SVG with CSS-animated dashes: Solar → Load / Battery / Grid and
 * Battery/Grid → Load. Flow speed and stroke weight scale with the energy
 * moved over the day, so the diagram reflects real data.
 */
export function EnergyFlow({ totals, latestSoc }: EnergyFlowProps) {
  const maxFlow = Math.max(
    totals.solarToLoadKwh,
    totals.solarToBatteryKwh,
    totals.solarToGridKwh,
    totals.batteryToLoadKwh,
    totals.gridToLoadKwh,
    0.001
  );

  // Map a flow to animation speed (0.6s-2.4s) and stroke width (1.5-4).
  const speed = (flow: number) => {
    if (flow <= 0) return "0s"; // static (invisible anyway)
    const t = Math.min(1, flow / maxFlow);
    return `${(2.4 - 1.8 * t).toFixed(2)}s`;
  };
  const width = (flow: number) => {
    if (flow <= 0) return 1.5;
    const t = Math.min(1, flow / maxFlow);
    return 1.5 + 2.5 * t;
  };
  const className = (flow: number) =>
    flow > 0 ? "urja-flow-line urja-flow-active" : "urja-flow-line";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
      <svg
        viewBox="0 0 560 300"
        role="img"
        aria-label="Energy flow diagram showing solar serving load, battery, and grid"
        className="h-auto w-full max-w-[560px]"
      >
        {/* Node: Solar (top-left) */}
        <g transform="translate(60,44)">
          <circle r="30" className="fill-energy-amber/15 stroke-energy-amber" strokeWidth="1.5" />
          <text textAnchor="middle" y="-44" className="fill-foreground text-[13px] font-semibold">
            SOLAR
          </text>
          <text textAnchor="middle" y="52" className="fill-muted-foreground text-[11px] tabular-nums">
            {formatKwh(totals.solarToLoadKwh + totals.solarToBatteryKwh + totals.solarToGridKwh)}
          </text>
        </g>

        {/* Node: Load (center) */}
        <g transform="translate(280,150)">
          <circle r="34" className="fill-primary/10 stroke-primary" strokeWidth="1.5" />
          <text textAnchor="middle" y="-44" className="fill-foreground text-[13px] font-semibold">
            LOAD
          </text>
          <text textAnchor="middle" y="56" className="fill-muted-foreground text-[11px] tabular-nums">
            consumed
          </text>
        </g>

        {/* Node: Battery (right) */}
        <g transform="translate(490,150)">
          <circle r="30" className="fill-energy-green/15 stroke-energy-green" strokeWidth="1.5" />
          <text textAnchor="middle" y="-42" className="fill-foreground text-[13px] font-semibold">
            BATTERY
          </text>
          <text textAnchor="middle" y="52" className="fill-muted-foreground text-[11px] tabular-nums">
            {latestSoc !== null ? `${formatPercent(latestSoc)} SOC` : "—"}
          </text>
        </g>

        {/* Node: Grid (bottom-left) */}
        <g transform="translate(60,256)">
          <circle r="30" className="fill-chart-4/15 stroke-chart-4" strokeWidth="1.5" />
          <text textAnchor="middle" y="-44" className="fill-foreground text-[13px] font-semibold">
            GRID
          </text>
          <text textAnchor="middle" y="52" className="fill-muted-foreground text-[11px] tabular-nums">
            {formatKwh(totals.gridToLoadKwh)} in
          </text>
        </g>

        {/* Edges (drawn under labels) */}
        <g fill="none" strokeLinecap="round">
          {/* Solar → Load */}
          <path
            d="M 88 66 L 252 128"
            className={className(totals.solarToLoadKwh)}
            stroke="var(--color-energy-amber)"
            strokeWidth={width(totals.solarToLoadKwh)}
            strokeDasharray="7 7"
            style={{ animationDuration: speed(totals.solarToLoadKwh) }}
          />
          {/* Solar → Battery (around the top to the right node) */}
          <path
            d="M 88 44 C 260 -10 380 -10 462 128"
            className={className(totals.solarToBatteryKwh)}
            stroke="var(--color-energy-amber)"
            strokeWidth={width(totals.solarToBatteryKwh)}
            strokeDasharray="7 7"
            style={{ animationDuration: speed(totals.solarToBatteryKwh) }}
          />
          {/* Solar → Grid (down the left side) */}
          <path
            d="M 52 76 C 20 120 20 180 52 224"
            className={className(totals.solarToGridKwh)}
            stroke="var(--color-energy-amber)"
            strokeWidth={width(totals.solarToGridKwh)}
            strokeDasharray="7 7"
            style={{ animationDuration: speed(totals.solarToGridKwh) }}
          />
          {/* Battery → Load */}
          <path
            d="M 458 150 L 316 150"
            className={className(totals.batteryToLoadKwh)}
            stroke="var(--color-energy-green)"
            strokeWidth={width(totals.batteryToLoadKwh)}
            strokeDasharray="7 7"
            style={{ animationDuration: speed(totals.batteryToLoadKwh) }}
          />
          {/* Grid → Load */}
          <path
            d="M 88 256 C 180 262 220 220 252 172"
            className={className(totals.gridToLoadKwh)}
            stroke="var(--color-chart-4)"
            strokeWidth={width(totals.gridToLoadKwh)}
            strokeDasharray="7 7"
            style={{ animationDuration: speed(totals.gridToLoadKwh) }}
          />
        </g>
      </svg>

      {/* Legend with values */}
      <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-1">
        {[
          { label: "Solar → Load", value: totals.solarToLoadKwh, color: "bg-energy-amber" },
          { label: "Solar → Battery", value: totals.solarToBatteryKwh, color: "bg-energy-amber/60" },
          { label: "Solar → Grid (export)", value: totals.solarToGridKwh, color: "bg-energy-amber/30" },
          { label: "Battery → Load", value: totals.batteryToLoadKwh, color: "bg-energy-green" },
          { label: "Grid → Load (import)", value: totals.gridToLoadKwh, color: "bg-chart-4" },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2"
          >
            <dt className="flex items-center gap-2 text-muted-foreground">
              <span className={`inline-block size-2.5 rounded-full ${item.color}`} />
              {item.label}
            </dt>
            <dd className="font-semibold tabular-nums">{formatKwh(item.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
