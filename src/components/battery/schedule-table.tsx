import { formatCurrency } from "@/lib/energy/format";
import type { ScheduleRowView } from "@/lib/energy/optimization-service";

interface ScheduleTableProps {
  schedule: ScheduleRowView[];
  currency: string;
}

const ACTION_STYLES: Record<string, string> = {
  charge: "bg-chart-2/10 text-chart-2",
  discharge: "bg-chart-1/10 text-chart-1",
  grid: "bg-chart-4/10 text-chart-4",
  solar_to_load: "bg-energy-amber/10 text-energy-amber",
  idle: "bg-muted text-muted-foreground",
};

const ACTION_LABELS: Record<string, string> = {
  charge: "Charge (solar)",
  discharge: "Discharge",
  grid: "Charge (grid)",
  solar_to_load: "Solar → load",
  idle: "Idle",
};

/** Hourly recommendation table — every row is a suggestion, not a command. */
export function ScheduleTable({ schedule, currency }: ScheduleTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">
          Recommended hourly battery schedule (simulation output)
        </caption>
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="pb-2 pr-4 font-medium">Hour</th>
            <th scope="col" className="pb-2 pr-4 font-medium">Action</th>
            <th scope="col" className="pb-2 pr-4 text-right font-medium">Power</th>
            <th scope="col" className="pb-2 pr-4 text-right font-medium">Tariff</th>
            <th scope="col" className="pb-2 pr-4 text-right font-medium">Grid cost</th>
            <th scope="col" className="pb-2 text-right font-medium">Saving</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((row) => (
            <tr key={row.timestamp} className="border-b last:border-0">
              <td className="py-2.5 pr-4 tabular-nums">{row.label}</td>
              <td className="py-2.5 pr-4">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    ACTION_STYLES[row.action] ?? ACTION_STYLES.idle
                  }`}
                >
                  {ACTION_LABELS[row.action] ?? row.action}
                </span>
              </td>
              <td className="py-2.5 pr-4 text-right tabular-nums">
                {row.chargePowerKw > 0
                  ? `+${row.chargePowerKw} kW`
                  : row.dischargePowerKw > 0
                    ? `−${row.dischargePowerKw} kW`
                    : "—"}
              </td>
              <td className="py-2.5 pr-4 text-right tabular-nums">
                {formatCurrency(row.tariffRate, currency, 2)}
              </td>
              <td className="py-2.5 pr-4 text-right tabular-nums">
                {formatCurrency(row.expectedCost, currency, 2)}
              </td>
              <td className="py-2.5 text-right tabular-nums">
                {row.expectedSaving > 0 ? (
                  <span className="font-medium text-chart-2">
                    +{formatCurrency(row.expectedSaving, currency, 2)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
