import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAnalyticsData,
  isAnalyticsRangeKey,
  resolveRangeWindow,
} from "@/lib/energy/analytics-service";
import type {
  BatteryReading,
  ConsumptionReading,
  EnergySystem,
  GridReading,
  SolarReading,
} from "@/types/energy";

/**
 * Analytics aggregation tests against a stubbed Supabase client.
 *
 * Fixture: two full local days (D-2 and D-1), hourly readings, TOU tariff
 * (₹6 off-peak, ₹12 peak 17:00–22:00). All expected values below are derived
 * by hand, including the invariant baseline − actual = estimated savings.
 */

const SOLAR_HOURS = Array.from({ length: 12 }, (_, i) => i + 6); // 06..17
const PEAK = { name: "peak", startHour: 17, endHour: 22, rate: 12 };
const OFF_PEAK_A = { name: "day", startHour: 0, endHour: 17, rate: 6 };
const OFF_PEAK_B = { name: "night", startHour: 22, endHour: 24, rate: 6 };

function ts(daysAgo: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function buildRows(daysAgoList: number[]) {
  const solar: Pick<SolarReading, "timestamp" | "energy_kwh">[] = [];
  const consumption: Pick<ConsumptionReading, "timestamp" | "energy_kwh" | "load_kw">[] = [];
  const battery: Pick<BatteryReading, "timestamp" | "charge_power" | "discharge_power">[] = [];
  const grid: Pick<GridReading, "timestamp" | "import_kw" | "export_kw">[] = [];

  for (const daysAgo of daysAgoList) {
    for (const hour of SOLAR_HOURS) {
      // 5 kWh/h, plus 3 kWh of surplus at noon that gets exported.
      solar.push({ timestamp: ts(daysAgo, hour), energy_kwh: hour === 12 ? 8 : 5 });
    }
    for (let hour = 0; hour < 24; hour += 1) {
      consumption.push({ timestamp: ts(daysAgo, hour), energy_kwh: 5, load_kw: 5 });
    }
    battery.push({ timestamp: ts(daysAgo, 12), charge_power: 3, discharge_power: 0 });
    for (const hour of [18, 19, 20]) {
      battery.push({ timestamp: ts(daysAgo, hour), charge_power: 0, discharge_power: 2 });
    }
    for (let hour = 0; hour < 24; hour += 1) {
      const solarKwh = SOLAR_HOURS.includes(hour) ? (hour === 12 ? 8 : 5) : 0;
      const dischargeKwh = [18, 19, 20].includes(hour) ? 2 : 0;
      const importKwh = Math.max(0, 5 - solarKwh - dischargeKwh);
      const exportKwh = Math.max(0, solarKwh - 5);
      grid.push({ timestamp: ts(daysAgo, hour), import_kw: importKwh, export_kw: exportKwh });
    }
  }
  return { solar, consumption, battery, grid };
}

function makeSystem(): EnergySystem {
  return {
    id: "sys-1",
    user_id: "user-1",
    name: "Analytics Stub",
    location: null,
    system_type: "industrial",
    solar_capacity_kw: 100,
    battery_capacity_kwh: 200,
    battery_max_charge_kw: 50,
    battery_max_discharge_kw: 50,
    min_soc: 10,
    max_soc: 90,
    battery_charge_efficiency: 0.95,
    battery_discharge_efficiency: 0.95,
    electricity_tariff: {
      type: "tou",
      currency: "INR",
      periods: [OFF_PEAK_A, PEAK, OFF_PEAK_B],
    },
    currency: "INR",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function stubClient<T extends { timestamp: string }>(rows: T[]): SupabaseClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    lt: () => builder,
    order: () => builder,
    range: () => Promise.resolve({ data: rows, error: null }),
  };
  return {
    from: () => builder,
  } as unknown as SupabaseClient;
}

const EMPTY_SYSTEM = makeSystem();

describe("analytics range selection", () => {
  it("accepts only the defined range keys", () => {
    expect(isAnalyticsRangeKey("today")).toBe(true);
    expect(isAnalyticsRangeKey("1y")).toBe(true);
    expect(isAnalyticsRangeKey("fortnight")).toBe(false);
    expect(isAnalyticsRangeKey(undefined)).toBe(false);
  });

  it("resolves windows ending at local today", () => {
    const { startDay, days } = resolveRangeWindow("7d");
    expect(days).toBe(7);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expectedStart = new Date(today);
    expectedStart.setDate(expectedStart.getDate() - 6);
    expect(startDay.getTime()).toBe(expectedStart.getTime());
  });
});

describe("getAnalyticsData", () => {
  it("returns hasData=false for a system with no readings", async () => {
    const data = await getAnalyticsData(stubClient([]), EMPTY_SYSTEM, "7d");
    expect(data.hasData).toBe(false);
    expect(data.daily).toEqual([]);
    expect(data.cost.estimatedSavings).toBe(0);
  });

  it("aggregates two TOU-priced days with exact totals and metrics", async () => {
    const rows = buildRows([2, 1]);
    const client: SupabaseClient = {
      from: (table: string) => {
        const rowsForTable =
          table === "solar_readings"
            ? rows.solar
            : table === "consumption_readings"
              ? rows.consumption
              : table === "battery_readings"
                ? rows.battery
                : rows.grid;
        return stubClient(rowsForTable as { timestamp: string }[]).from(table);
      },
    } as unknown as SupabaseClient;

    const data = await getAnalyticsData(client, makeSystem(), "7d");

    expect(data.hasData).toBe(true);
    expect(data.daily.length).toBe(2);

    // Energy totals (2 identical days).
    expect(data.totals.solarKwh).toBeCloseTo(126, 1); // 63/day
    expect(data.totals.consumptionKwh).toBeCloseTo(240, 1);
    expect(data.totals.gridImportKwh).toBeCloseTo(108, 1); // 54/day
    expect(data.totals.gridExportKwh).toBeCloseTo(6, 1); // 3/day
    expect(data.totals.batteryDischargeKwh).toBeCloseTo(12, 1);
    expect(data.totals.batteryChargeKwh).toBeCloseTo(6, 1);
    expect(data.totals.peakDemandKw).toBeCloseTo(5, 1);
    expect(data.totals.avgDemandKw).toBeCloseTo(5, 1);
    expect(data.totals.daysWithData).toBe(2);

    // Metrics.
    expect(data.metrics.selfConsumptionPct).toBeCloseTo(95.2, 1); // (126-6)/126
    expect(data.metrics.gridDependencyPct).toBeCloseTo(45, 1); // 108/240
    expect(data.metrics.solarUtilizationPct).toBeCloseTo(57.5, 1); // (126+12)/240
    expect(data.metrics.energyWastagePct).toBeCloseTo(4.8, 1); // 6/126
    expect(data.metrics.batteryUtilizationPct).toBeCloseTo(3, 1); // 12 kWh / 200 kWh / 2 days

    // Hour-weighted TOU cost breakdown (hand-derived, see fixture).
    expect(data.cost.baselineCost).toBeCloseTo(1740, 0);
    expect(data.cost.actualGridCost).toBeCloseTo(816, 0);
    expect(data.cost.solarSavings).toBeCloseTo(780, 0);
    expect(data.cost.batterySavings).toBeCloseTo(144, 0);
    expect(data.cost.estimatedSavings).toBeCloseTo(924, 0);

    // Invariant: baseline − actual = estimated savings.
    expect(
      data.cost.baselineCost - data.cost.actualGridCost
    ).toBeCloseTo(data.cost.estimatedSavings, 0);

    // Per-day values and chronological labels.
    expect(data.daily[0].cost).toBeCloseTo(408, 0);
    expect(data.daily[0].savings).toBeCloseTo(462, 0);
    expect(data.daily[1].cost).toBeCloseTo(408, 0);
    expect(data.daily[0].day < data.daily[1].day).toBe(true);
  });

  it("handles partial days without crashing (today in progress)", async () => {
    const data = await getAnalyticsData(stubClient([
      { timestamp: ts(0, 0), energy_kwh: 1 },
    ]), makeSystem(), "today");
    // ts(0,0) is today's local midnight — inside the "today" window.
    if (new Date().getHours() >= 0) {
      expect(data.hasData).toBe(true);
      expect(data.totals.solarKwh).toBeCloseTo(1, 3);
    }
  });
});
