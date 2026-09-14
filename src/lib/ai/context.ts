/**
 * Copilot grounding context (spec §40, §84).
 *
 * The model must answer ONLY from the factual block built here — real numbers
 * from the user's own system. If a number is not in the block, the prompt
 * instructs the model to say it does not have that data. No fabricated
 * accuracy, no invented readings.
 *
 * `buildCopilotContext` and `buildSystemPrompt` are pure and tested; the
 * loader reuses the analytics, forecasting, and optimization services so the
 * Copilot always sees exactly what the UI sees.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnalyticsData } from "@/lib/energy/analytics-service";
import { getForecastPageData } from "@/lib/energy/forecast-service";
import { getOptimizationPageData } from "@/lib/energy/optimization-service";
import { formatTariffSummary } from "@/lib/energy/tariff";
import { formatDayLabel } from "@/lib/energy/time";
import type { EnergySystem } from "@/types/energy";

export interface CopilotContextInput {
  system: EnergySystem;
  analytics: {
    hasData: boolean;
    rangeLabel: string;
    fromDayKey: string | null;
    toDayKey: string | null;
    solarKwh: number;
    consumptionKwh: number;
    gridImportKwh: number;
    gridExportKwh: number;
    batteryChargeKwh: number;
    batteryDischargeKwh: number;
    peakDemandKw: number;
    selfConsumptionPct: number;
    gridDependencyPct: number;
    solarUtilizationPct: number;
    energyWastagePct: number;
    batteryUtilizationPct: number;
    baselineCost: number;
    actualGridCost: number;
    estimatedSavings: number;
  } | null;
  forecasts: {
    hasForecasts: boolean;
    hasEvaluated: boolean;
    solarMape: number | null;
    consumptionMape: number | null;
    solarHorizonKwh: number | null;
    consumptionHorizonKwh: number | null;
  };
  optimization: {
    hasPlan: boolean;
    expectedSaving: number | null;
    arbitrageEnabled: boolean | null;
    totalDischargeKwh: number | null;
  };
}

/** Builds the factual context block from system data (pure). */
export function buildCopilotContext(input: CopilotContextInput): string {
  const { system } = input;
  const lines: string[] = [];

  lines.push("SYSTEM");
  lines.push(
    `- Name: ${system.name} (${system.system_type})${system.location ? `, ${system.location}` : ""}`
  );
  lines.push(
    `- Solar capacity: ${system.solar_capacity_kw} kW; Battery: ${system.battery_capacity_kwh} kWh ` +
      `(max ${system.battery_max_charge_kw} kW charge / ${system.battery_max_discharge_kw} kW discharge, ` +
      `SOC window ${system.min_soc}–${system.max_soc}%, ` +
      `round-trip efficiency ≈ ${Math.round(system.battery_charge_efficiency * system.battery_discharge_efficiency * 1000) / 10}%)`
  );
  lines.push(`- Tariff: ${formatTariffSummary(system.electricity_tariff)}`);

  const a = input.analytics;
  if (a && a.hasData) {
    lines.push("");
    lines.push(
      `LAST ${a.rangeLabel.toUpperCase()} (${formatDayLabel(a.fromDayKey ?? "")} to ${formatDayLabel(a.toDayKey ?? "")}, estimates valued at the tariff)`
    );
    lines.push(`- Solar generated: ${a.solarKwh} kWh (self-consumed ${a.selfConsumptionPct}%)`);
    lines.push(
      `- Consumption: ${a.consumptionKwh} kWh (peak demand ${a.peakDemandKw} kW)`
    );
    lines.push(
      `- Grid: imported ${a.gridImportKwh} kWh (${a.gridDependencyPct}% dependency), exported ${a.gridExportKwh} kWh`
    );
    lines.push(
      `- Battery: discharged ${a.batteryDischargeKwh} kWh, charged ${a.batteryChargeKwh} kWh (${a.batteryUtilizationPct}% utilization)`
    );
    lines.push(
      `- Cost: baseline (no solar/battery) would be ${a.baselineCost}; actual grid cost ${a.actualGridCost}; ` +
        `estimated savings ${a.estimatedSavings} (ESTIMATE, not guaranteed)`
    );
    lines.push(
      `- Efficiency: solar utilization ${a.solarUtilizationPct}%, energy wastage ${a.energyWastagePct}%`
    );
  } else {
    lines.push("");
    lines.push("LAST 7 DAYS: no readings yet for this system.");
  }

  lines.push("");
  lines.push("FORECASTS (baseline-v1, learned from the last 21 days)");
  if (input.forecasts.hasForecasts) {
    lines.push(
      `- Upcoming 7-day forecast: solar ≈ ${input.forecasts.solarHorizonKwh ?? "n/a"} kWh, consumption ≈ ${input.forecasts.consumptionHorizonKwh ?? "n/a"} kWh`
    );
    if (input.forecasts.hasEvaluated) {
      lines.push(
        `- MEASURED accuracy: solar MAPE ${input.forecasts.solarMape ?? "n/a"}%, consumption MAPE ${input.forecasts.consumptionMape ?? "n/a"}% (from predicted-vs-actual pairs)`
      );
    } else {
      lines.push(
        "- Accuracy: not yet measurable — no forecast hours have passed with actuals."
      );
    }
  } else {
    lines.push("- No forecasts generated yet for this system.");
  }

  lines.push("");
  lines.push("BATTERY OPTIMIZATION (rule-based-v1, decision-support only)");
  if (input.optimization.hasPlan) {
    lines.push(
      `- Current plan: expected saving ≈ ${input.optimization.expectedSaving ?? 0} over the horizon ` +
        `(arbitrage ${input.optimization.arbitrageEnabled ? "enabled" : "not profitable for this tariff"}; ` +
        `planned discharge ${input.optimization.totalDischargeKwh ?? 0} kWh)`
    );
  } else {
    lines.push("- No optimization schedule generated yet.");
  }

  return lines.join("\n");
}

/**
 * Loads live data for the grounding block by reusing the same services the
 * pages use, so the Copilot never sees numbers the UI cannot reproduce.
 */
export async function loadCopilotContext(
  supabase: SupabaseClient,
  system: EnergySystem
): Promise<CopilotContextInput> {
  const [analytics, forecasts, optimization] = await Promise.all([
    getAnalyticsData(supabase, system, "7d"),
    getForecastPageData(supabase, system, "7d"),
    getOptimizationPageData(supabase, system, "7d"),
  ]);

  return {
    system,
    analytics:
      analytics.hasData
        ? {
            hasData: true,
            rangeLabel: analytics.rangeLabel,
            fromDayKey: analytics.fromDayKey,
            toDayKey: analytics.toDayKey,
            solarKwh: analytics.totals.solarKwh,
            consumptionKwh: analytics.totals.consumptionKwh,
            gridImportKwh: analytics.totals.gridImportKwh,
            gridExportKwh: analytics.totals.gridExportKwh,
            batteryChargeKwh: analytics.totals.batteryChargeKwh,
            batteryDischargeKwh: analytics.totals.batteryDischargeKwh,
            peakDemandKw: analytics.totals.peakDemandKw,
            selfConsumptionPct: analytics.metrics.selfConsumptionPct,
            gridDependencyPct: analytics.metrics.gridDependencyPct,
            solarUtilizationPct: analytics.metrics.solarUtilizationPct,
            energyWastagePct: analytics.metrics.energyWastagePct,
            batteryUtilizationPct: analytics.metrics.batteryUtilizationPct,
            baselineCost: analytics.cost.baselineCost,
            actualGridCost: analytics.cost.actualGridCost,
            estimatedSavings: analytics.cost.estimatedSavings,
          }
        : null,
    forecasts: {
      hasForecasts: forecasts.hasForecasts,
      hasEvaluated: forecasts.hasEvaluated,
      solarMape: forecasts.solar.accuracy?.mape ?? null,
      consumptionMape: forecasts.consumption.accuracy?.mape ?? null,
      solarHorizonKwh: forecasts.hasForecasts
        ? forecasts.solar.horizonTotalKwh
        : null,
      consumptionHorizonKwh: forecasts.hasForecasts
        ? forecasts.consumption.horizonTotalKwh
        : null,
    },
    optimization: {
      hasPlan: optimization.hasPlan,
      expectedSaving: optimization.hasPlan
        ? optimization.summary.expectedSaving
        : null,
      arbitrageEnabled: optimization.hasPlan
        ? optimization.summary.arbitrageEnabled
        : null,
      totalDischargeKwh: optimization.hasPlan
        ? optimization.summary.totalDischargeKwh
        : null,
    },
  };
}

/** Builds the full system prompt: rules + factual block (pure). */
export function buildSystemPrompt(contextBlock: string): string {
  return [
    "You are UrjaOS Copilot, an energy-management assistant inside the UrjaOS platform.",
    "The user owns the energy system described below. Answer their question using ONLY",
    "the factual data in this message. If the answer is not derivable from this data,",
    "say plainly that you do not have that data — never invent numbers, never guess.",
    "",
    "Rules:",
    "- Savings figures are ESTIMATES valued at the user's tariff; always keep (or add) the",
    "  'estimate, not guaranteed' qualifier when you mention them.",
    "- Optimization outputs are decision-support recommendations, never device commands.",
    "- Be concrete: quote the exact numbers from the data block when they answer the question.",
    "- Keep answers under ~180 words. Use at most 4 short bullets when a list helps.",
    "- Currency follows the tariff line in the data block.",
    "",
    "FACTUAL DATA BLOCK (the only source of truth for this answer):",
    "────────────────────────────────────────",
    contextBlock,
    "────────────────────────────────────────",
  ].join("\n");
}
