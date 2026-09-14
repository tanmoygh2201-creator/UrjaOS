import { Sun, Zap } from "lucide-react";
import {
  formatKwh,
  formatPercent,
} from "@/lib/energy/format";
import type { ForecastTypeBlock } from "@/lib/energy/forecast-service";

interface AccuracyCardsProps {
  solar: ForecastTypeBlock;
  consumption: ForecastTypeBlock;
}

const GRADE_STYLES: Record<string, string> = {
  excellent: "bg-chart-2/10 text-chart-2",
  good: "bg-chart-2/10 text-chart-2",
  fair: "bg-energy-amber/10 text-energy-amber",
  poor: "bg-destructive/10 text-destructive",
};

function Card({
  icon,
  title,
  block,
  iconClass,
  chipClass,
}: {
  icon: React.ReactNode;
  title: string;
  block: ForecastTypeBlock;
  iconClass: string;
  chipClass: string;
}) {
  const accuracy = block.accuracy;
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className={`flex size-7 items-center justify-center rounded-lg ${iconClass}`}>
            {icon}
          </span>
          <span className="text-xs font-medium uppercase tracking-wide">{title}</span>
        </div>
        {accuracy ? (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${chipClass}`}
          >
            {accuracy.grade} · {formatPercent(accuracy.mape, 1)} MAPE
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            awaiting actuals
          </span>
        )}
      </div>

      {accuracy ? (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted/40 p-2">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              MAE
            </dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums">
              {formatKwh(accuracy.mae, 2)}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/40 p-2">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              RMSE
            </dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums">
              {formatKwh(accuracy.rmse, 2)}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/40 p-2">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              MAPE
            </dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums">
              {formatPercent(accuracy.mape, 1)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Accuracy appears once forecast hours pass and actual readings arrive.
        </p>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        {accuracy
          ? `${accuracy.samples} evaluated hourly forecasts · MAE is the mean absolute miss in kWh.`
          : "Measured from data — never assumed."}
      </p>
    </div>
  );
}

/** Measured MAE/RMSE/MAPE cards for both forecast types (spec §34). */
export function AccuracyCards({ solar, consumption }: AccuracyCardsProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card
        icon={<Sun className="size-4 text-energy-amber" aria-hidden="true" />}
        iconClass="bg-energy-amber/10"
        chipClass={GRADE_STYLES[solar.accuracy?.grade ?? "poor"]}
        title="Solar forecast accuracy"
        block={solar}
      />
      <Card
        icon={<Zap className="size-4 text-chart-3" aria-hidden="true" />}
        iconClass="bg-chart-3/10"
        chipClass={GRADE_STYLES[consumption.accuracy?.grade ?? "poor"]}
        title="Consumption forecast accuracy"
        block={consumption}
      />
    </div>
  );
}
