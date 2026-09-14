/**
 * Optimization data service (spec §35–38).
 *
 * GET path is read-only: assembles the persisted schedule for the page.
 * The action path recomputes the plan from upcoming forecasts and replaces
 * the system's future schedule rows (idempotent regeneration).
 *
 * Every output is labeled a RECOMMENDATION — nothing here controls devices.
 */
import type { SupabaseClient as DbClient } from "@supabase/supabase-js";
import {
  planOptimalSchedule,
  type PlanHourInput,
} from "./optimizer";
import { getTariffRateForHour } from "@/lib/validation/tariff";
import type { TariffConfigInput } from "@/lib/validation/tariff";
import { resolveHorizon, type ForecastHorizonKey } from "./forecast-service";
import { formatHourLabel, startOfLocalDay } from "./time";
import type { EnergySystem, OptimizationSchedule } from "@/types/energy";

const MODE_LABEL = "rule-based-v1 (charge-side lookahead)";

export interface OptimizationSummaryView {
  baselineCost: number;
  optimizedCost: number;
  expectedSaving: number;
  totalDischargeKwh: number;
  totalChargeKwh: number;
  equivalentCycles: number;
  gridChargeKwh: number;
  arbitrageEnabled: boolean;
}

export interface ScheduleRowView {
  timestamp: string;
  label: string;
  action: string;
  chargePowerKw: number;
  dischargePowerKw: number;
  soc: number;
  tariffRate: number;
  expectedCost: number;
  expectedSaving: number;
}

export interface OptimizationPageData {
  system: EnergySystem;
  horizonKey: ForecastHorizonKey;
  horizonLabel: string;
  modelLabel: string;
  hasBattery: boolean;
  hasPlan: boolean;
  hasForecasts: boolean;
  startSoc: number | null;
  summary: OptimizationSummaryView;
  schedule: ScheduleRowView[];
}

// ── Computation + persistence (action path) ───────────────────────────────

export interface RunOptimizationResult {
  ok: boolean;
  error?: string;
  hoursPlanned?: number;
  expectedSaving?: number;
}

/**
 * Recomputes the optimal schedule from upcoming forecasts and replaces the
 * system's future rows. Returns NO_FORECASTS / NO_BATTERY sentinels so the
 * page can explain itself instead of failing silently.
 */
export async function runOptimization(
  supabase: DbClient,
  system: EnergySystem,
  horizonKey: ForecastHorizonKey
): Promise<RunOptimizationResult> {
  if (system.battery_capacity_kwh <= 0) {
    return { ok: false, error: "NO_BATTERY" };
  }

  const horizon = resolveHorizon(horizonKey);
  const nowIso = new Date().toISOString();
  const horizonEnd = new Date(startOfLocalDay());
  horizonEnd.setDate(horizonEnd.getDate() + horizon.days);
  const horizonEndIso = horizonEnd.toISOString();

  const [solarRes, consumptionRes, batteryRes] = await Promise.all([
    supabase
      .from("forecasts")
      .select("timestamp, predicted_value")
      .eq("system_id", system.id)
      .eq("forecast_type", "solar")
      .gte("timestamp", nowIso)
      .lt("timestamp", horizonEndIso)
      .order("timestamp", { ascending: true })
      .limit(500),
    supabase
      .from("forecasts")
      .select("timestamp, predicted_value")
      .eq("system_id", system.id)
      .eq("forecast_type", "consumption")
      .gte("timestamp", nowIso)
      .lt("timestamp", horizonEndIso)
      .order("timestamp", { ascending: true })
      .limit(500),
    supabase
      .from("battery_readings")
      .select("soc")
      .eq("system_id", system.id)
      .order("timestamp", { ascending: false })
      .limit(1),
  ]);

  if (solarRes.error) return { ok: false, error: solarRes.error.message };
  if (consumptionRes.error) return { ok: false, error: consumptionRes.error.message };
  if (batteryRes.error) return { ok: false, error: batteryRes.error.message };

  const solarRows = (solarRes.data ?? []) as unknown as {
    timestamp: string;
    predicted_value: number;
  }[];
  const consumptionRows = (consumptionRes.data ?? []) as unknown as {
    timestamp: string;
    predicted_value: number;
  }[];

  if (solarRows.length === 0 && consumptionRows.length === 0) {
    return { ok: false, error: "NO_FORECASTS" };
  }

  // Join forecast types by timestamp; missing side counts as 0 for the hour.
  const solarByTs = new Map(solarRows.map((r) => [r.timestamp, r.predicted_value]));
  const consumptionByTs = new Map(
    consumptionRows.map((r) => [r.timestamp, r.predicted_value])
  );
  const timestamps = [
    ...new Set([...solarRows, ...consumptionRows].map((r) => r.timestamp)),
  ].sort();

  const tariff = system.electricity_tariff as TariffConfigInput;
  const hours: PlanHourInput[] = timestamps.map((ts) => ({
    timestamp: ts,
    solarKwh: solarByTs.get(ts) ?? 0,
    consumptionKwh: consumptionByTs.get(ts) ?? 0,
    tariffRate: getTariffRateForHour(tariff, new Date(ts).getHours()),
  }));

  const latestSoc = (batteryRes.data?.[0] as unknown as { soc: number } | undefined)?.soc;
  const startSoc =
    typeof latestSoc === "number"
      ? latestSoc
      : (system.min_soc + system.max_soc) / 2;

  const plan = planOptimalSchedule(system, hours, startSoc);

  // Replace future recommendations for this system (idempotent regeneration).
  const { error: deleteError } = await supabase
    .from("optimization_schedules")
    .delete()
    .eq("system_id", system.id)
    .gte("timestamp", nowIso);
  if (deleteError) return { ok: false, error: deleteError.message };

  const rows = plan.schedule.map((hour) => ({
    system_id: system.id,
    timestamp: hour.timestamp,
    action: hour.action,
    charge_power: hour.chargePowerKw,
    discharge_power: hour.dischargePowerKw,
    expected_cost: hour.expectedCost,
    expected_saving: hour.expectedSaving,
  }));

  for (let i = 0; i < rows.length; i += 500) {
    const { error: insertError } = await supabase
      .from("optimization_schedules")
      .insert(rows.slice(i, i + 500));
    if (insertError) return { ok: false, error: insertError.message };
  }

  return {
    ok: true,
    hoursPlanned: plan.schedule.length,
    expectedSaving: plan.summary.expectedSaving,
  };
}

// ── Read-only page assembly ───────────────────────────────────────────────

/** Loads the persisted future schedule and summary for the page. */
export async function getOptimizationPageData(
  supabase: DbClient,
  system: EnergySystem,
  horizonKey: ForecastHorizonKey
): Promise<OptimizationPageData> {
  const horizon = resolveHorizon(horizonKey);
  const nowIso = new Date().toISOString();

  const [scheduleRes, forecastRes] = await Promise.all([
    supabase
      .from("optimization_schedules")
      .select("*")
      .eq("system_id", system.id)
      .gte("timestamp", nowIso)
      .order("timestamp", { ascending: true })
      .limit(500),
    supabase
      .from("forecasts")
      .select("id")
      .eq("system_id", system.id)
      .gte("timestamp", nowIso)
      .limit(1),
  ]);

  const rows = (scheduleRes.data ?? []) as unknown as OptimizationSchedule[];
  const hasForecasts = (forecastRes.data ?? []).length > 0;

  let baselineCost = 0;
  let optimizedCost = 0;
  let expectedSaving = 0;
  let totalDischargeKwh = 0;
  let totalChargeKwh = 0;
  let gridChargeKwh = 0;

  const tariff = system.electricity_tariff as TariffConfigInput;
  const schedule: ScheduleRowView[] = rows.map((row) => {
    baselineCost += (row.expected_cost ?? 0) + (row.expected_saving ?? 0);
    optimizedCost += row.expected_cost ?? 0;
    expectedSaving += row.expected_saving ?? 0;
    totalDischargeKwh += row.discharge_power;
    totalChargeKwh += row.charge_power;
    if (row.action === "grid") gridChargeKwh += row.charge_power;

    return {
      timestamp: row.timestamp,
      label: formatHourLabel(row.timestamp),
      action: row.action,
      chargePowerKw: row.charge_power,
      dischargePowerKw: row.discharge_power,
      soc: 0,
      tariffRate: getTariffRateForHour(tariff, new Date(row.timestamp).getHours()),
      expectedCost: row.expected_cost ?? 0,
      expectedSaving: row.expected_saving ?? 0,
    };
  });

  const hasBattery = system.battery_capacity_kwh > 0;
  const arbitrageEnabled =
    hasBattery &&
    tariff.type === "tou" &&
    tariff.periods.some((p) => p.rate > 0) &&
    Math.max(...tariff.periods.map((p) => p.rate)) >=
      Math.min(...tariff.periods.map((p) => p.rate)) * 1.25;

  return {
    system,
    horizonKey,
    horizonLabel: horizon.label,
    modelLabel: MODE_LABEL,
    hasBattery,
    hasPlan: rows.length > 0,
    hasForecasts,
    startSoc: null,
    summary: {
      baselineCost: round2(baselineCost),
      optimizedCost: round2(optimizedCost),
      expectedSaving: round2(expectedSaving),
      totalDischargeKwh: round3(totalDischargeKwh),
      totalChargeKwh: round3(totalChargeKwh),
      equivalentCycles:
        system.battery_capacity_kwh > 0
          ? round2(totalDischargeKwh / system.battery_capacity_kwh)
          : 0,
      gridChargeKwh: round3(gridChargeKwh),
      arbitrageEnabled,
    },
    schedule,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
