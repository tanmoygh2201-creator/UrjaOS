/**
 * Dashboard data service (spec §24-25, §29).
 *
 * Fetches the latest local day of hourly readings plus the trailing 7 local
 * days, and derives everything the dashboard renders: KPIs, per-hour energy
 * flows, and daily series. All monetary values are ESTIMATES via the cost
 * engine.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateEstimatedSavings,
  calculateGridDependency,
  calculateSelfConsumption,
} from "./cost";
import { addDays, localDayKey, localHour, startOfLocalDay } from "./time";
import type {
  BatteryReading,
  ConsumptionReading,
  EnergySystem,
  GridReading,
  SolarReading,
} from "@/types/energy";

export interface HourlyFlowPoint {
  hour: number; // 0-23 local
  label: string; // "09:00"
  solarKwh: number;
  consumptionKwh: number;
  gridImportKwh: number;
  gridExportKwh: number;
  batteryChargeKwh: number;
  batteryDischargeKwh: number;
  soc: number | null;
}

export interface DailyPoint {
  day: string; // local day key
  label: string; // "14 Sep"
  solarKwh: number;
  consumptionKwh: number;
  gridImportKwh: number;
  savings: number;
}

export interface FlowTotals {
  solarToLoadKwh: number;
  solarToBatteryKwh: number;
  solarToGridKwh: number;
  batteryToLoadKwh: number;
  gridToLoadKwh: number;
}

export interface DashboardKpis {
  solarKwh: number;
  consumptionKwh: number;
  gridImportKwh: number;
  gridExportKwh: number;
  batteryChargeKwh: number;
  batteryDischargeKwh: number;
  latestSoc: number | null;
  /** Estimated savings for the latest day (baseline − actual cost). */
  savings: number;
  selfConsumptionPct: number;
  gridDependencyPct: number;
  cost: number; // actual grid cost for the latest day
}

export interface DashboardData {
  system: EnergySystem;
  latestDayKey: string;
  hourly: HourlyFlowPoint[];
  daily: DailyPoint[];
  totals: FlowTotals;
  kpis: DashboardKpis;
}

interface ReadingRows {
  solar: SolarReading[];
  consumption: ConsumptionReading[];
  battery: BatteryReading[];
  grid: GridReading[];
}

async function fetchRange(
  supabase: SupabaseClient,
  systemId: string,
  fromIso: string,
  toIso: string
): Promise<ReadingRows> {
  const [solar, consumption, battery, grid] = await Promise.all([
    supabase
      .from("solar_readings")
      .select("*")
      .eq("system_id", systemId)
      .gte("timestamp", fromIso)
      .lt("timestamp", toIso)
      .order("timestamp", { ascending: true }),
    supabase
      .from("consumption_readings")
      .select("*")
      .eq("system_id", systemId)
      .gte("timestamp", fromIso)
      .lt("timestamp", toIso)
      .order("timestamp", { ascending: true }),
    supabase
      .from("battery_readings")
      .select("*")
      .eq("system_id", systemId)
      .gte("timestamp", fromIso)
      .lt("timestamp", toIso)
      .order("timestamp", { ascending: true }),
    supabase
      .from("grid_readings")
      .select("*")
      .eq("system_id", systemId)
      .gte("timestamp", fromIso)
      .lt("timestamp", toIso)
      .order("timestamp", { ascending: true }),
  ]);

  return {
    solar: (solar.data ?? []) as SolarReading[],
    consumption: (consumption.data ?? []) as ConsumptionReading[],
    battery: (battery.data ?? []) as BatteryReading[],
    grid: (grid.data ?? []) as GridReading[],
  };
}

/** Derives per-hour flows for a single local day from raw rows. */
function buildHourly(rows: ReadingRows, dayKey: string): HourlyFlowPoint[] {
  const byHour = new Map<number, HourlyFlowPoint>();
  const ensure = (ts: string): HourlyFlowPoint => {
    const hour = localHour(ts);
    let point = byHour.get(hour);
    if (!point) {
      point = {
        hour,
        label: `${String(hour).padStart(2, "0")}:00`,
        solarKwh: 0,
        consumptionKwh: 0,
        gridImportKwh: 0,
        gridExportKwh: 0,
        batteryChargeKwh: 0,
        batteryDischargeKwh: 0,
        soc: null,
      };
      byHour.set(hour, point);
    }
    return point;
  };

  for (const row of rows.solar) {
    if (localDayKey(row.timestamp) !== dayKey) continue;
    ensure(row.timestamp).solarKwh += row.energy_kwh;
  }
  for (const row of rows.consumption) {
    if (localDayKey(row.timestamp) !== dayKey) continue;
    ensure(row.timestamp).consumptionKwh += row.energy_kwh;
  }
  for (const row of rows.battery) {
    if (localDayKey(row.timestamp) !== dayKey) continue;
    const point = ensure(row.timestamp);
    point.batteryChargeKwh += row.charge_power;
    point.batteryDischargeKwh += row.discharge_power;
    point.soc = row.soc; // last row in the hour wins (ordered ascending)
  }
  for (const row of rows.grid) {
    if (localDayKey(row.timestamp) !== dayKey) continue;
    const point = ensure(row.timestamp);
    point.gridImportKwh += row.import_kw;
    point.gridExportKwh += row.export_kw;
  }

  return [...byHour.values()].sort((a, b) => a.hour - b.hour);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Loads dashboard data for a system. Returns null when the system has no
 * readings yet (caller renders the empty state).
 */
export async function getDashboardData(
  supabase: SupabaseClient,
  system: EnergySystem
): Promise<DashboardData | null> {
  const today = startOfLocalDay();
  const windowStart = addDays(today, -6); // today + previous 6 days
  const fromIso = windowStart.toISOString();
  const toIso = addDays(today, 1).toISOString();

  const rows = await fetchRange(supabase, system.id, fromIso, toIso);
  const allTimestamps = [
    ...rows.solar.map((r) => r.timestamp),
    ...rows.consumption.map((r) => r.timestamp),
    ...rows.battery.map((r) => r.timestamp),
    ...rows.grid.map((r) => r.timestamp),
  ];
  if (allTimestamps.length === 0) return null;

  // Latest local day present in the data (not necessarily today).
  const latestDayKey = localDayKey(
    allTimestamps.reduce((a, b) => (a > b ? a : b))
  );

  const hourly = buildHourly(rows, latestDayKey);

  // ── Latest-day KPIs ───────────────────────────────────────────────────
  let solarKwh = 0;
  let consumptionKwh = 0;
  let gridImportKwh = 0;
  let gridExportKwh = 0;
  let batteryChargeKwh = 0;
  let batteryDischargeKwh = 0;
  let cost = 0;
  let savings = 0;
  let latestSoc: number | null = null;

  const consumptionByHour = new Map<number, number>();
  for (const row of rows.consumption) {
    if (localDayKey(row.timestamp) !== latestDayKey) continue;
    consumptionByHour.set(
      localHour(row.timestamp),
      (consumptionByHour.get(localHour(row.timestamp)) ?? 0) + row.energy_kwh
    );
  }

  const tariffByHour = new Map<number, number>();
  for (const row of rows.grid) {
    if (localDayKey(row.timestamp) !== latestDayKey) continue;
    tariffByHour.set(localHour(row.timestamp), row.tariff ?? 0);
  }

  for (const point of hourly) {
    solarKwh += point.solarKwh;
    consumptionKwh += point.consumptionKwh;
    gridImportKwh += point.gridImportKwh;
    gridExportKwh += point.gridExportKwh;
    batteryChargeKwh += point.batteryChargeKwh;
    batteryDischargeKwh += point.batteryDischargeKwh;
    if (point.soc !== null) latestSoc = point.soc;

    const rate = tariffByHour.get(point.hour) ?? 0;
    cost += point.gridImportKwh * rate;
    savings += calculateEstimatedSavings({
      solarServedKwh: point.solarKwh,
      batteryServedKwh: point.batteryDischargeKwh,
      tariffRate: rate,
    });
  }

  // ── Daily series (trailing 7 local days, only days with data) ─────────
  const solarByDay = new Map<string, number>();
  for (const row of rows.solar) {
    const key = localDayKey(row.timestamp);
    solarByDay.set(key, (solarByDay.get(key) ?? 0) + row.energy_kwh);
  }
  const consumptionByDay = new Map<string, number>();
  for (const row of rows.consumption) {
    const key = localDayKey(row.timestamp);
    consumptionByDay.set(key, (consumptionByDay.get(key) ?? 0) + row.energy_kwh);
  }
  const importByDay = new Map<string, number>();
  const savingsByDay = new Map<string, number>();
  for (const row of rows.grid) {
    const key = localDayKey(row.timestamp);
    importByDay.set(key, (importByDay.get(key) ?? 0) + row.import_kw);
  }
  const dischargeByDay = new Map<string, number>();
  for (const row of rows.battery) {
    const key = localDayKey(row.timestamp);
    dischargeByDay.set(key, (dischargeByDay.get(key) ?? 0) + row.discharge_power);
  }
  for (const key of new Set([
    ...solarByDay.keys(),
    ...consumptionByDay.keys(),
  ])) {
    const saved = calculateEstimatedSavings({
      solarServedKwh: solarByDay.get(key) ?? 0,
      batteryServedKwh: Math.min(
        dischargeByDay.get(key) ?? 0,
        Math.max(0, (consumptionByDay.get(key) ?? 0) - (solarByDay.get(key) ?? 0))
      ),
      tariffRate: system.electricity_tariff.type === "flat"
        ? system.electricity_tariff.rate
        : 8.5, // conservative fallback for TOU; per-hour costing used for KPIs
    });
    savingsByDay.set(key, saved);
  }

  const daily: DailyPoint[] = [];
  for (let i = 0; i < 7; i += 1) {
    const day = localDayKey(addDays(windowStart, i));
    const solar = solarByDay.get(day);
    const consumption = consumptionByDay.get(day);
    if (solar === undefined && consumption === undefined) continue;
    daily.push({
      day,
      label: new Date(day.replace(/-/g, "/")).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      }),
      solarKwh: round3(solar ?? 0),
      consumptionKwh: round3(consumption ?? 0),
      gridImportKwh: round3(importByDay.get(day) ?? 0),
      savings: Math.round(savingsByDay.get(day) ?? 0),
    });
  }

  const totals: FlowTotals = {
    solarToLoadKwh: 0,
    solarToBatteryKwh: round3(batteryChargeKwh),
    solarToGridKwh: round3(gridExportKwh),
    batteryToLoadKwh: round3(batteryDischargeKwh),
    gridToLoadKwh: round3(gridImportKwh),
  };
  for (const point of hourly) {
    totals.solarToLoadKwh += Math.min(point.solarKwh, point.consumptionKwh);
  }
  totals.solarToLoadKwh = round3(totals.solarToLoadKwh);

  return {
    system,
    latestDayKey,
    hourly,
    daily,
    totals,
    kpis: {
      solarKwh: round3(solarKwh),
      consumptionKwh: round3(consumptionKwh),
      gridImportKwh: round3(gridImportKwh),
      gridExportKwh: round3(gridExportKwh),
      batteryChargeKwh: round3(batteryChargeKwh),
      batteryDischargeKwh: round3(batteryDischargeKwh),
      latestSoc,
      savings: Math.round(savings),
      selfConsumptionPct:
        Math.round(calculateSelfConsumption(solarKwh, gridExportKwh) * 10) / 10,
      gridDependencyPct:
        Math.round(calculateGridDependency(gridImportKwh, consumptionKwh) * 10) / 10,
      cost: Math.round(cost * 100) / 100,
    },
  };
}
