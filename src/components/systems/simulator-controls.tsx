"use client";

import { useState, useTransition } from "react";
import { CloudSun, Loader2, RotateCcw, Sparkles, Sun, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  generateDataAction,
  resetDataAction,
  type SimulationActionResult,
} from "@/app/actions/simulation";

interface SimulatorControlsProps {
  systemId: string;
}

type Scenario = "normal" | "sunny" | "cloudy" | "high-load";

const SCENARIOS: Record<Scenario, { label: string; icon: typeof Sun; days: number; cloudiness?: number }> = {
  normal: { label: "Generate 30 days", icon: Zap, days: 30 },
  sunny: { label: "Sunny day", icon: Sun, days: 1, cloudiness: 0 },
  cloudy: { label: "Cloudy day", icon: CloudSun, days: 1, cloudiness: 0.85 },
  "high-load": { label: "High consumption day", icon: Sparkles, days: 1, cloudiness: 0.3 },
};

export function SimulatorControls({ systemId }: SimulatorControlsProps) {
  const [pending, startTransition] = useTransition();
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [result, setResult] = useState<SimulationActionResult | null>(null);

  function run(nextScenario: Scenario) {
    setScenario(nextScenario);
    setResult(null);
    const formData = new FormData();
    formData.set("systemId", systemId);
    const config = SCENARIOS[nextScenario];
    formData.set("days", String(config.days));
    if (config.cloudiness !== undefined) {
      formData.set("cloudiness", String(config.cloudiness));
    }
    startTransition(async () => {
      const actionResult = await generateDataAction(formData);
      setResult(actionResult);
    });
  }

  function reset() {
    setResult(null);
    const formData = new FormData();
    formData.set("systemId", systemId);
    startTransition(async () => {
      const actionResult = await resetDataAction(formData);
      setResult(
        actionResult.ok
          ? { ok: true }
          : { ok: false, error: actionResult.error ?? "Reset failed." }
      );
    });
  }

  const busy = pending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="size-4 text-primary" aria-hidden="true" />
          Energy simulator
        </CardTitle>
        <CardDescription>
          Generate realistic simulated IoT data — no hardware required. The
          same seed always produces the same data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            Object.keys(SCENARIOS) as Scenario[]
          ).map((key) => {
            const config = SCENARIOS[key];
            const active = scenario === key && busy;
            return (
              <Button
                key={key}
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                aria-busy={active}
                onClick={() => run(key)}
              >
                {active ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <config.icon aria-hidden="true" />
                )}
                {config.label}
              </Button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="sim-days">Custom range (days)</Label>
            <Input
              id="sim-days"
              type="number"
              min={1}
              max={92}
              defaultValue={30}
              className="w-28"
              disabled={busy}
              onChange={(e) => {
                SCENARIOS.normal.days = Math.min(
                  92,
                  Math.max(1, Number(e.target.value) || 1)
                );
              }}
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => run("normal")}
          >
            {busy && scenario === "normal" ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : null}
            Generate
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={reset}
          >
            <RotateCcw aria-hidden="true" />
            Reset data
          </Button>
        </div>

        {result?.ok && result.written !== undefined ? (
          <div
            role="status"
            className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm text-primary"
          >
            Generated {result.written.toLocaleString("en-IN")} readings
            {result.startDate && result.endDate
              ? ` (${result.startDate} → ${result.endDate})`
              : ""}
            . Open the dashboard to explore.
          </div>
        ) : null}
        {result?.ok && result.written === undefined ? (
          <div
            role="status"
            className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm text-primary"
          >
            Data reset. Generate new data any time.
          </div>
        ) : null}
        {result && !result.ok ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          >
            {result.error ?? "Something went wrong."}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
