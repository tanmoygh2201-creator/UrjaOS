import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOptimizationPageData,
  runOptimization,
} from "@/lib/energy/optimization-service";
import type { EnergySystem, OptimizationSchedule } from "@/types/energy";

function makeSystem(
  overrides: Partial<EnergySystem> = {}
): EnergySystem {
  return {
    id: "sys-1",
    user_id: "user-1",
    name: "Optimization Stub",
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
      periods: [
        { name: "day", startHour: 0, endHour: 17, rate: 6 },
        { name: "peak", startHour: 17, endHour: 22, rate: 12 },
        { name: "night", startHour: 22, endHour: 24, rate: 6 },
      ],
    },
    currency: "INR",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function stubClient(tables: Record<string, unknown[]>): SupabaseClient {
  return {
    from: (table: string) => {
      const rows = tables[table] ?? [];
      const builder = {
        select: () => builder,
        insert: () => Promise.resolve({ data: null, error: null }),
        update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        delete: () => ({ eq: () => ({ gte: () => Promise.resolve({ data: null, error: null }) }) }),
        eq: () => builder,
        gte: () => builder,
        lt: () => builder,
        order: () => builder,
        limit: () => Promise.resolve({ data: rows, error: null, count: rows.length }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("runOptimization sentinels", () => {
  it("refuses systems without a battery", async () => {
    const result = await runOptimization(
      stubClient({}),
      makeSystem({ battery_capacity_kwh: 0 }),
      "7d"
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("NO_BATTERY");
  });

  it("reports NO_FORECASTS when no upcoming forecasts exist", async () => {
    const result = await runOptimization(
      stubClient({ forecasts: [], battery_readings: [] }),
      makeSystem(),
      "7d"
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("NO_FORECASTS");
  });

  it("plans and persists from upcoming forecasts", async () => {
    const future = (hoursAhead: number): string => {
      const d = new Date();
      d.setHours(d.getHours() + hoursAhead, 0, 0, 0);
      return d.toISOString();
    };
    const forecasts = [
      { timestamp: future(24), forecast_type: "solar", predicted_value: 30 },
      { timestamp: future(24), forecast_type: "consumption", predicted_value: 60 },
      { timestamp: future(25), forecast_type: "solar", predicted_value: 30 },
      { timestamp: future(25), forecast_type: "consumption", predicted_value: 60 },
    ];
    const result = await runOptimization(
      stubClient({
        forecasts,
        battery_readings: [{ soc: 50 }],
        optimization_schedules: [],
      }),
      makeSystem(),
      "7d"
    );
    expect(result.ok).toBe(true);
    expect(result.hoursPlanned).toBe(2);
  });
});

describe("getOptimizationPageData", () => {
  it("assembles summary from persisted schedule rows", async () => {
    // Deterministic local hours TOMORROW, so TOU window resolution never
    // depends on the wall-clock time the suite happens to run at.
    const at = (hour: number): string => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(hour, 0, 0, 0);
      return d.toISOString();
    };
    const rows: Partial<OptimizationSchedule>[] = [
      {
        system_id: "sys-1",
        timestamp: at(10), // day window → ₹6
        action: "grid",
        charge_power: 10,
        discharge_power: 0,
        expected_cost: 100,
        expected_saving: -60,
      },
      {
        system_id: "sys-1",
        timestamp: at(18), // peak window → ₹12
        action: "discharge",
        charge_power: 0,
        discharge_power: 9,
        expected_cost: 12,
        expected_saving: 96,
      },
    ];
    const data = await getOptimizationPageData(
      stubClient({
        optimization_schedules: rows,
        forecasts: [{ id: "f1" }],
      }),
      makeSystem(),
      "7d"
    );

    expect(data.hasPlan).toBe(true);
    expect(data.hasForecasts).toBe(true);
    expect(data.hasBattery).toBe(true);
    expect(data.schedule).toHaveLength(2);
    // baseline = Σ(cost + saving) = 40 + 108; optimized = Σ cost = 112.
    expect(data.summary.baselineCost).toBeCloseTo(148, 0);
    expect(data.summary.optimizedCost).toBeCloseTo(112, 0);
    expect(data.summary.expectedSaving).toBeCloseTo(36, 0);
    expect(data.summary.totalDischargeKwh).toBeCloseTo(9, 3);
    expect(data.summary.gridChargeKwh).toBeCloseTo(10, 3);
    expect(data.summary.arbitrageEnabled).toBe(true);
    // Tariff on the discharge hour resolves from the system's TOU config
    // (18:00 local → peak window, ₹12).
    expect(data.schedule[1].tariffRate).toBe(12);
  });
});
