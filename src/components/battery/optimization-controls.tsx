"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runOptimizationAction } from "@/app/actions/optimization";
import { FORECAST_HORIZONS, type ForecastHorizonKey } from "@/lib/energy/forecast-service";

interface OptimizationControlsProps {
  selected: ForecastHorizonKey;
  systemId: string;
}

const ERROR_COPY: Record<string, string> = {
  NO_FORECASTS:
    "No forecasts yet — generate a forecast on the Forecasting page first.",
  NO_BATTERY:
    "This system has no battery configured, so there is nothing to optimize.",
};

/** Horizon switcher + run-optimization button (spec §35–38). */
export function OptimizationControls({
  selected,
  systemId,
}: OptimizationControlsProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();

  function run() {
    setError(null);
    setNotice(null);
    const formData = new FormData();
    formData.set("systemId", systemId);
    formData.set("horizon", selected);
    startTransition(async () => {
      const result = await runOptimizationAction(formData);
      if (result.ok) {
        setNotice(
          `Schedule ready — ${result.hoursPlanned} hours planned, estimated saving ${Math.round(
            result.expectedSaving ?? 0
          )}.`
        );
        router.refresh();
      } else {
        setError(ERROR_COPY[result.error ?? ""] ?? result.error ?? "Could not run the optimizer.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div
        role="tablist"
        aria-label="Optimization horizon"
        className="flex flex-wrap gap-1.5 rounded-xl border border-border/60 bg-muted/40 p-1.5"
      >
        {FORECAST_HORIZONS.map((horizon) => {
          const isActive = horizon.key === selected;
          return (
            <Link
              key={horizon.key}
              href={`/battery?horizon=${horizon.key}&system=${systemId}`}
              role="tab"
              aria-selected={isActive}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-background hover:text-foreground"
              }`}
            >
              {horizon.label}
            </Link>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <Button onClick={run} disabled={pending} size="sm">
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Wand2 aria-hidden="true" />
          )}
          {pending ? "Planning…" : "Run optimizer"}
        </Button>
        {notice ? (
          <p role="status" className="text-xs text-muted-foreground">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
