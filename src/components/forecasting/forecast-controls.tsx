"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateForecastsAction } from "@/app/actions/forecasting";
import { FORECAST_HORIZONS, type ForecastHorizonKey } from "@/lib/energy/forecast-service";

interface ForecastControlsProps {
  selected: ForecastHorizonKey;
  systemId: string;
}

/** Horizon switcher + generate button (spec §34: 24h / 7d). */
export function ForecastControls({ selected, systemId }: ForecastControlsProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();

  function generate() {
    setError(null);
    setNotice(null);
    const formData = new FormData();
    formData.set("systemId", systemId);
    formData.set("horizon", selected);
    startTransition(async () => {
      const result = await generateForecastsAction(formData);
      if (result.ok) {
        setNotice(
          result.written
            ? `Forecast ready — ${result.written} hourly predictions saved${
                result.backfilled ? `, ${result.backfilled} actuals backfilled` : ""
              }.`
            : "Forecast refreshed."
        );
        router.refresh();
      } else {
        setError(result.error ?? "Could not generate forecasts.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div
        role="tablist"
        aria-label="Forecast horizon"
        className="flex flex-wrap gap-1.5 rounded-xl border border-border/60 bg-muted/40 p-1.5"
      >
        {FORECAST_HORIZONS.map((horizon) => {
          const isActive = horizon.key === selected;
          return (
            <Link
              key={horizon.key}
              href={`/forecasting?horizon=${horizon.key}&system=${systemId}`}
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
        <Button onClick={generate} disabled={pending} size="sm">
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw aria-hidden="true" />
          )}
          {pending ? "Learning patterns…" : "Generate / refresh forecast"}
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
