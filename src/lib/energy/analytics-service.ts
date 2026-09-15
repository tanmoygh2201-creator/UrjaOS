/**
 * Analytics data service (spec §29).
 *
 * Aggregates readings over a selectable local-day range and derives every
 * metric the analytics page renders: utilization, self-consumption, grid
 * dependency, wastage, battery utilization, peak/average demand, and the
 * cost breakdown. All monetary values are ESTIMATES from the cost engine.
 *
 * Every kWh is priced at the tariff in effect for its hour (flat or TOU via
 * getTariffRateForHour), so savings are hour-weighted and honest under both
 * tariff types.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/energy/paged-fetch";
import { calculateBaselineCost } from "./cost";
import { getTariffRateForHour } from "@/lib/validation/tariff";
import type { TariffConfigInput } from "@/lib/validation/tariff";
import {
  addDays,
  formatDayLabel,
  localDayKey,
  localDayRangeIso,
  startOfLocalDay,
} from "./time";
import type {
  BatteryReading,
  ConsumptionReading,
  EnergySystem,
  GridReading,
  SolarReading,
} from "@/types/energy";

// ── Range selection (spec §29: Today → 1 Year) ────────────────────────────

export const ANALYTICS_RANGES = [
  { key: "today", label: "Today", days: 1 },
  { key: "7d", label: "7 Days", days: 7 },
  { key: "30d", label: "30 Days", days: 30 },
  { key: "3m", label: "3 Months", days: 90 },
  { key: "6m", label: "6 Months", days: 180 },
  { key: "1y", label: "1 Year", days: 365 },
] as const;

export type AnalyticsRangeKey = (typeof ANALYTICS_RANGES)[number]["key"];

export function isAnalyticsRangeKey(
  value: string | undefined
): value is AnalyticsRangeKey {
  return ANALYTICS_RANGES.some((r) => r.key === value);
}

/** Resolves a range key to an inclusive local-day window ending today. */
export function resolveRangeWindow(rangeKey: AnalyticsRangeKey): {
  startDay: Date;
  days: number;
} {
  const range =
    ANALYTICS_RANGES.find((r) => r.key === rangeKey) ?? ANALYTICS_RANGES[1];
  const endDay = startOfLocalDay();
  return { startDay: addDays(endDay, -(range.days - 1)), days: range.days };
}

// ── Derived shapes ─────────────────────────────────────────────────────────

export interface DailyAnalyticsPoint {
  day: string; // local day key
  label: string;
  solarKwh: number;
  consumptionKwh: number;
  gridImportKwh: number;
  batteryChargeKwh: number;
  batteryDischargeKwh: number;
  /** Estimated grid cost for the day, tariff-aware per hour. */
  cost: number;
  /** Estimated savings for the day, tariff-aware per hour. */
  savings: number;
}

export interface AnalyticsTotals {
  solarKwh: number;
  consumptionKwh: number;
  gridImportKwh: number;
  gridExportKwh: number;
  batteryChargeKwh: number;
  batteryDischargeKwh: number;
  peakDemandKw: number;
  avgDemandKw: number;
  /** Local days with at least one reading inside the range. */
  daysWithData: number;
}

export interface AnalyticsCostBreakdown {
  /** What the grid would have charged for all consumption (no solar/battery). */
  baselineCost: number;
  /** What the grid actually charged for imports. */
  actualGridCost: number;
  solarSavings: number;
  batterySavings: number;
  estimatedSavings: number;
}

export interface AnalyticsMetrics {
  solarUtilizationPct: number;
  selfConsumptionPct: number;
  gridDependencyPct: number;
  energyWastagePct: number;
  /** Avg equivalent full cycles per day × 100, capped at 100. */
  batteryUtilizationPct: number;
  estimatedSavings: number;
}

export interface AnalyticsData {
  system: EnergySystem;
  rangeKey: AnalyticsRangeKey;
  rangeLabel: string;
  fromDayKey: string | null;
  toDayKey: string | null;
  hasData: boolean;
  totals: AnalyticsTotals;
  metrics: AnalyticsMetrics;
  cost: AnalyticsCostBreakdown;
  daily: DailyAnalyticsPoint[];
}

// ── Fetching ─────────────────────────────────────────────────────────────

// ── Service ─────────────────────────────────────────────────────────────

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

interface HourCell {
  solarKwh: number;
  consumptionKwh: number;
  gridImportKwh: number;
  gridExportKwh: number;
  batteryChargeKwh: number;
  batteryDischargeKwh: number;
}

function emptyCell(): HourCell {
  return {
    solarKwh: 0,
    consumptionKwh: 0,
    gridImportKwh: 0,
    gridExportKwh: 0,
    batteryChargeKwh: 0,
    batteryDischargeKwh: 0,
  };
}

/**
 * Loads and aggregates analytics for a system over the requested range.
 * `hasData` is false when the system has no readings in the window.
 */
export async function getAnalyticsData(
  supabase: SupabaseClient,
  system: EnergySystem,
  rangeKey: AnalyticsRangeKey
): Promise<AnalyticsData> {
  const { startDay, days } = resolveRangeWindow(rangeKey);
  const { fromIso, toIso } = localDayRangeIso(startDay, startOfLocalDay());

  const [solar, consumption, battery, grid] = await Promise.all([
    fetchAllPages<SolarReading>(
      supabase,
      "solar_readings",
      "timestamp, energy_kwh",
      system.id,
      fromIso,
      toIso
    ),
    fetchAllPages<ConsumptionReading>(
      supabase,
      "consumption_readings",
      "timestamp, energy_kwh, load_kw",
      system.id,
      fromIso,
      toIso
    ),
    fetchAllPages<BatteryReading>(
      supabase,
      "battery_readings",
      "timestamp, charge_power, discharge_power",
      system.id,
      fromIso,
      toIso
    ),
    fetchAllPages<GridReading>(
      supabase,
      "grid_readings",
      "timestamp, import_kw, export_kw",
      system.id,
      fromIso,
      toIso
    ),
  ]);

  const rangeLabel =
    ANALYTICS_RANGES.find((r) => r.key === rangeKey)?.label ?? "7 Days";

  const base: AnalyticsData = {
    system,
    rangeKey,
    rangeLabel,
    fromDayKey: null,
    toDayKey: null,
    hasData: false,
    totals: {
      solarKwh: 0,
      consumptionKwh: 0,
      gridImportKwh: 0,
      gridExportKwh: 0,
      batteryChargeKwh: 0,
      batteryDischargeKwh: 0,
      peakDemandKw: 0,
      avgDemandKw: 0,
      daysWithData: 0,
    },
    metrics: {
      solarUtilizationPct: 0,
      selfConsumptionPct: 0,
      gridDependencyPct: 0,
      energyWastagePct: 0,
      batteryUtilizationPct: 0,
      estimatedSavings: 0,
    },
    cost: {
      baselineCost: 0,
      actualGridCost: 0,
      solarSavings: 0,
      batterySavings: 0,
      estimatedSavings: 0,
    },
    daily: [],
  };

  if (
    solar.length === 0 &&
    consumption.length === 0 &&
    battery.length === 0 &&
    grid.length === 0
  ) {
    return base;
  }

  const tariff = system.electricity_tariff as TariffConfigInput;

  // ── Accumulate raw rows into (local day × hour) cells ────────────────────
  const byDay = new Map<string, Map<number, HourCell>>();
  const peakByDay = new Map<string, number>();

  const cellFor = (ts: string): HourCell => {
    const dayKey = localDayKey(ts);
    let hours = byDay.get(dayKey);
    if (!hours) {
      hours = new Map();
      byDay.set(dayKey, hours);
    }
    const hour = new Date(ts).getHours();
    let cell = hours.get(hour);
    if (!cell) {
      cell = emptyCell();
      hours.set(hour, cell);
    }
    return cell;
  };

  for (const row of solar) cellFor(row.timestamp).solarKwh += row.energy_kwh;
  for (const row of consumption) {
    const cell = cellFor(row.timestamp);
    cell.consumptionKwh += row.energy_kwh;
    const key = localDayKey(row.timestamp);
    peakByDay.set(key, Math.max(peakByDay.get(key) ?? 0, row.load_kw));
  }
  for (const row of battery) {
    const cell = cellFor(row.timestamp);
    cell.batteryChargeKwh += row.charge_power;
    cell.batteryDischargeKwh += row.discharge_power;
  }
  for (const row of grid) {
    const cell = cellFor(row.timestamp);
    cell.gridImportKwh += row.import_kw;
    cell.gridExportKwh += row.export_kw;
  }

  // ── One pricing pass over every (day, hour) cell ─────────────────────────
  let actualGridCost = 0;
  let baselineCost = 0;
  let solarSavingsTotal = 0;
  let batterySavingsTotal = 0;
  const costByDay = new Map<string, number>();
  const savingsByDay = new Map<string, number>();

  for (const [dayKey, hours] of byDay) {
    for (const [hour, cell] of hours) {
      const rate = getTariffRateForHour(tariff, hour);

      actualGridCost += calculateBaselineCost(cell.gridImportKwh, rate);
      baselineCost += calculateBaselineCost(cell.consumptionKwh, rate);

      const solarServed = Math.min(cell.solarKwh, cell.consumptionKwh);
      const batteryServed = Math.min(
        cell.batteryDischargeKwh,
        Math.max(0, cell.consumptionKwh - cell.solarKwh)
      );
      solarSavingsTotal += calculateBaselineCost(solarServed, rate);
      batterySavingsTotal += calculateBaselineCost(batteryServed, rate);
      savingsByDay.set(
        dayKey,
        (savingsByDay.get(dayKey) ?? 0) +
          calculateBaselineCost(solarServed + batteryServed, rate)
      );
      costByDay.set(
        dayKey,
        (costByDay.get(dayKey) ?? 0) +
          calculateBaselineCost(cell.gridImportKwh, rate)
      );
    }
  }

  // ── Period totals ─────────────────────────────────────────────────────────
  let totalSolar = 0;
  let totalConsumption = 0;
  let totalImport = 0;
  let totalExport = 0;
  let totalCharge = 0;
  let totalDischarge = 0;
  let peakDemand = 0;
  let loadKwSum = 0;

  for (const hours of byDay.values()) {
    for (const cell of hours.values()) {
      totalSolar += cell.solarKwh;
      totalConsumption += cell.consumptionKwh;
      totalImport += cell.gridImportKwh;
      totalExport += cell.gridExportKwh;
      totalCharge += cell.batteryChargeKwh;
      totalDischarge += cell.batteryDischargeKwh;
    }
  }
  for (const value of peakByDay.values()) {
    peakDemand = Math.max(peakDemand, value);
  }
  for (const row of consumption) loadKwSum += row.load_kw;
  const avgDemand = consumption.length > 0 ? loadKwSum / consumption.length : 0;

  const daysWithData = byDay.size;

  // Battery utilization: average equivalent full discharge cycles per day,
  // expressed as a percentage of one cycle per day (capped at 100).
  const batteryUtilizationPct =
    system.battery_capacity_kwh > 0 && daysWithData > 0
      ? Math.min(
          100,
          (totalDischarge / system.battery_capacity_kwh / daysWithData) * 100
        )
      : 0;

  // ── Daily series (chronological, only days with data) ────────────────────
  const daily: DailyAnalyticsPoint[] = [];
  for (let i = 0; i < days; i += 1) {
    const key = localDayKey(addDays(startDay, i));
    const hours = byDay.get(key);
    if (!hours) continue;

    let solarKwh = 0;
    let consumptionKwh = 0;
    let gridImportKwh = 0;
    let batteryChargeKwh = 0;
    let batteryDischargeKwh = 0;
    for (const cell of hours.values()) {
      solarKwh += cell.solarKwh;
      consumptionKwh += cell.consumptionKwh;
      gridImportKwh += cell.gridImportKwh;
      batteryChargeKwh += cell.batteryChargeKwh;
      batteryDischargeKwh += cell.batteryDischargeKwh;
    }

    daily.push({
      day: key,
      label: formatDayLabel(key),
      solarKwh: round3(solarKwh),
      consumptionKwh: round3(consumptionKwh),
      gridImportKwh: round3(gridImportKwh),
      batteryChargeKwh: round3(batteryChargeKwh),
      batteryDischargeKwh: round3(batteryDischargeKwh),
      cost: Math.round((costByDay.get(key) ?? 0) * 100) / 100,
      savings: Math.round(savingsByDay.get(key) ?? 0),
    });
  }

  // ── Metrics (spec §29) ───────────────────────────────────────────────────
  const generated = Math.max(0, totalSolar);
  const selfConsumptionPct =
    generated > 0
      ? ((generated - Math.min(Math.max(0, totalExport), generated)) / generated) * 100
      : 0;
  const gridDependencyPct =
    totalConsumption > 0
      ? (Math.min(Math.max(0, totalImport), totalConsumption) / totalConsumption) * 100
      : 0;
  const covered = Math.min(
    Math.max(0, totalSolar) + Math.max(0, totalDischarge),
    totalConsumption
  );
  const solarUtilizationPct =
    totalConsumption > 0 ? (covered / totalConsumption) * 100 : 0;
  const energyWastagePct =
    generated > 0 ? (Math.min(Math.max(0, totalExport), generated) / generated) * 100 : 0;

  const estimatedSavingsTotal = [...savingsByDay.values()].reduce(
    (sum, value) => sum + value,
    0
  );

  const dayKeys = [...byDay.keys()].sort();

  return {
    ...base,
    hasData: true,
    fromDayKey: dayKeys[0] ?? null,
    toDayKey: dayKeys[dayKeys.length - 1] ?? null,
    totals: {
      solarKwh: round3(totalSolar),
      consumptionKwh: round3(totalConsumption),
      gridImportKwh: round3(totalImport),
      gridExportKwh: round3(totalExport),
      batteryChargeKwh: round3(totalCharge),
      batteryDischargeKwh: round3(totalDischarge),
      peakDemandKw: round3(peakDemand),
      avgDemandKw: round3(avgDemand),
      daysWithData,
    },
    metrics: {
      solarUtilizationPct: round1(solarUtilizationPct),
      selfConsumptionPct: round1(selfConsumptionPct),
      gridDependencyPct: round1(gridDependencyPct),
      energyWastagePct: round1(energyWastagePct),
      batteryUtilizationPct: round1(batteryUtilizationPct),
      estimatedSavings: Math.round(estimatedSavingsTotal),
    },
    cost: {
      baselineCost: Math.round(baselineCost * 100) / 100,
      actualGridCost: Math.round(actualGridCost * 100) / 100,
      solarSavings: Math.round(solarSavingsTotal * 100) / 100,
      batterySavings: Math.round(batterySavingsTotal * 100) / 100,
      estimatedSavings: Math.round(estimatedSavingsTotal * 100) / 100,
    },
    daily,
  };
}
