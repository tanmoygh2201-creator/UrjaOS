import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/simulation/random";
import { simulateSolarHour } from "@/lib/simulation/solar";
import { simulateConsumptionHour } from "@/lib/simulation/consumption";
import {
  simulateBatteryHour,
  computeStartSoc,
} from "@/lib/simulation/battery";
import { simulate } from "@/lib/simulation/simulate";
import { DEMO_SCENARIOS } from "@/lib/simulation/demo";
import { defaultDailyTarget } from "@/lib/energy/targets";

describe("seeded RNG", () => {
  it("is deterministic for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 10; i += 1) {
      expect(a()).toBe(b());
    }
  });

  it("produces values in [0, 1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("solar model", () => {
  const base = { capacityKw: 100, cloudiness: 0, month: 5, rng: createRng(1) };

  it("generates zero at night hours", () => {
    for (const hour of [0, 3, 22]) {
      const { generationKw } = simulateSolarHour({ ...base, hour });
      expect(generationKw).toBe(0);
    }
  });

  it("peaks near solar noon and never exceeds capacity", () => {
    const peak = simulateSolarHour({ ...base, hour: 13 }).generationKw;
    const morning = simulateSolarHour({ ...base, hour: 9 }).generationKw;
    const evening = simulateSolarHour({ ...base, hour: 17 }).generationKw;
    expect(peak).toBeGreaterThan(morning);
    expect(peak).toBeGreaterThan(evening);
    expect(peak).toBeLessThanOrEqual(base.capacityKw);
  });

  it("clouds reduce output", () => {
    const sunny = simulateSolarHour({ ...base, hour: 12, cloudiness: 0 }).generationKw;
    const cloudy = simulateSolarHour({ ...base, hour: 12, cloudiness: 0.9 }).generationKw;
    expect(cloudy).toBeLessThan(sunny);
  });

  it("produces zero for zero-capacity systems", () => {
    const { generationKw } = simulateSolarHour({
      ...base,
      capacityKw: 0,
      hour: 12,
    });
    expect(generationKw).toBe(0);
  });
});

describe("consumption model", () => {
  const base = {
    dailyKwhTarget: 850,
    month: 5,
    dayOfWeek: 3,
    rng: createRng(2),
  };

  it("industrial load is higher in working hours than at 4am", () => {
    const morning = simulateConsumptionHour({ ...base, systemType: "industrial", hour: 10 });
    const night = simulateConsumptionHour({ ...base, systemType: "industrial", hour: 4 });
    expect(morning.loadKw).toBeGreaterThan(night.loadKw);
  });

  it("commercial load drops on weekends", () => {
    let weekday = 0;
    let weekend = 0;
    const mondayRng = createRng(3);
    const sundayRng = createRng(3);
    for (let h = 9; h <= 17; h += 1) {
      weekday += simulateConsumptionHour({
        ...base,
        systemType: "commercial",
        hour: h,
        dayOfWeek: 1,
        rng: mondayRng,
      }).energyKwh;
      weekend += simulateConsumptionHour({
        ...base,
        systemType: "commercial",
        hour: h,
        dayOfWeek: 0,
        rng: sundayRng,
      }).energyKwh;
    }
    expect(weekend).toBeLessThan(weekday);
  });

  it("never produces negative load", () => {
    const rng = createRng(4);
    for (let h = 0; h < 24; h += 1) {
      const { loadKw } = simulateConsumptionHour({
        ...base,
        systemType: "residential",
        hour: h,
        rng,
      });
      expect(loadKw).toBeGreaterThanOrEqual(0);
    }
  });

  it("scales with the daily target", () => {
    const small = simulateConsumptionHour({
      ...base,
      systemType: "commercial",
      hour: 12,
      dailyKwhTarget: 100,
    }).energyKwh;
    const large = simulateConsumptionHour({
      ...base,
      systemType: "commercial",
      hour: 12,
      dailyKwhTarget: 1000,
    }).energyKwh;
    expect(large).toBeGreaterThan(small * 5);
  });
});

describe("battery + grid integration", () => {
  const system = {
    battery_capacity_kwh: 200,
    battery_max_charge_kw: 50,
    battery_max_discharge_kw: 50,
    min_soc: 10,
    max_soc: 90,
    battery_charge_efficiency: 0.95,
    battery_discharge_efficiency: 0.95,
  };

  it("keeps SOC within [min, max] under surplus solar", () => {
    let soc = 50;
    for (let i = 0; i < 12; i += 1) {
      const r = simulateBatteryHour(
        { solarKwh: 60, consumptionKwh: 20 },
        { system, tariffRate: 8.5, averageTariff: 8.5, soc }
      );
      soc = r.soc;
      expect(soc).toBeLessThanOrEqual(90.01);
      expect(soc).toBeGreaterThanOrEqual(10);
    }
    expect(soc).toBeCloseTo(90, 0); // saturates at max SOC
  });

  it("never discharges below min SOC", () => {
    let soc = 12;
    for (let i = 0; i < 8; i += 1) {
      const r = simulateBatteryHour(
        { solarKwh: 0, consumptionKwh: 80 },
        { system, tariffRate: 12, averageTariff: 8.5, soc }
      );
      soc = r.soc;
      expect(soc).toBeGreaterThanOrEqual(9.99);
    }
  });

  it("charges from surplus before exporting", () => {
    const r = simulateBatteryHour(
      { solarKwh: 60, consumptionKwh: 20 },
      { system, tariffRate: 8.5, averageTariff: 8.5, soc: 50 }
    );
    expect(r.chargePowerKw).toBeCloseTo(40, 1); // min(net, max power)
    expect(r.gridExportKw).toBeCloseTo(0, 1);
  });

  it("exports surplus when the battery is full", () => {
    const r = simulateBatteryHour(
      { solarKwh: 60, consumptionKwh: 20 },
      { system, tariffRate: 8.5, averageTariff: 8.5, soc: 90 }
    );
    expect(r.chargePowerKw).toBeCloseTo(0, 1);
    expect(r.gridExportKw).toBeCloseTo(40, 1);
  });

  it("covers deficit from grid when SOC is at minimum (Case 2/5)", () => {
    const r = simulateBatteryHour(
      { solarKwh: 0, consumptionKwh: 30 },
      { system, tariffRate: 12, averageTariff: 8.5, soc: 10 }
    );
    expect(r.dischargePowerKw).toBe(0);
    expect(r.gridImportKw).toBeCloseTo(30, 1);
  });

  it("discharges during expensive hours when SOC allows (Case 4)", () => {
    const r = simulateBatteryHour(
      { solarKwh: 0, consumptionKwh: 30 },
      { system, tariffRate: 12, averageTariff: 8.5, soc: 80 }
    );
    expect(r.dischargePowerKw).toBeGreaterThan(0);
    expect(r.gridImportKw).toBeLessThan(30);
  });

  it("passes through both directions when no battery is configured", () => {
    const noBattery = { ...system, battery_capacity_kwh: 0 };
    const importResult = simulateBatteryHour(
      { solarKwh: 0, consumptionKwh: 10 },
      { system: noBattery, tariffRate: 8.5, averageTariff: 8.5, soc: 0 }
    );
    expect(importResult.gridImportKw).toBeCloseTo(10, 1);
    const exportResult = simulateBatteryHour(
      { solarKwh: 15, consumptionKwh: 5 },
      { system: noBattery, tariffRate: 8.5, averageTariff: 8.5, soc: 0 }
    );
    expect(exportResult.gridExportKw).toBeCloseTo(10, 1);
  });

  it("computeStartSoc stays within bounds", () => {
    expect(computeStartSoc(0, 10, 90)).toBe(10);
    expect(computeStartSoc(1, 10, 90)).toBe(90);
    expect(computeStartSoc(0.5, 10, 90)).toBe(50);
  });
});

describe("full-day orchestrator", () => {
  const scenario = DEMO_SCENARIOS[0];
  const system = {
    id: "00000000-0000-0000-0000-000000000001",
    ...scenario.system,
  };

  it("generates 24 rows per table per day", () => {
    const start = new Date(2026, 4, 10);
    const end = new Date(2026, 4, 11); // 2 days
    const result = simulate({
      system,
      dailyKwhTarget: scenario.dailyKwhTarget,
      startDate: start,
      endDate: end,
      seed: 99,
    });
    expect(result.solarRows).toHaveLength(48);
    expect(result.consumptionRows).toHaveLength(48);
    expect(result.batteryRows).toHaveLength(48);
    expect(result.gridRows).toHaveLength(48);
  });

  it("is deterministic for the same seed", () => {
    const range = { startDate: new Date(2026, 4, 10), endDate: new Date(2026, 4, 10) };
    const a = simulate({ system, dailyKwhTarget: 850, seed: 5, ...range });
    const b = simulate({ system, dailyKwhTarget: 850, seed: 5, ...range });
    expect(a.solarRows).toEqual(b.solarRows);
    expect(a.batteryRows).toEqual(b.batteryRows);
  });

  it("keeps all values non-negative and SOC in range", () => {
    const result = simulate({
      system,
      dailyKwhTarget: 850,
      startDate: new Date(2026, 4, 10),
      endDate: new Date(2026, 4, 16), // 7 days
      seed: 7,
    });
    for (const row of result.solarRows) {
      expect(row.generation_kw).toBeGreaterThanOrEqual(0);
      expect(row.energy_kwh).toBeGreaterThanOrEqual(0);
    }
    for (const row of result.consumptionRows) {
      expect(row.load_kw).toBeGreaterThanOrEqual(0);
    }
    for (const row of result.batteryRows) {
      expect(row.soc).toBeGreaterThanOrEqual(9.99);
      expect(row.soc).toBeLessThanOrEqual(90.01);
      expect(row.charge_power).toBeGreaterThanOrEqual(0);
      expect(row.discharge_power).toBeGreaterThanOrEqual(0);
      expect(row.charge_power * row.discharge_power).toBe(0); // never both
    }
    for (const row of result.gridRows) {
      expect(row.import_kw).toBeGreaterThanOrEqual(0);
      expect(row.export_kw).toBeGreaterThanOrEqual(0);
    }
  });

  /** Groups rows by the simulator's LOCAL day (timestamps are stored as UTC). */
  function sumByLocalDay(
    rows: { timestamp: string; energy_kwh: number }[]
  ): Map<string, number> {
    const byDay = new Map<string, number>();
    for (const row of rows) {
      const d = new Date(row.timestamp);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      byDay.set(key, (byDay.get(key) ?? 0) + row.energy_kwh);
    }
    return byDay;
  }

  it("daily solar stays realistic for the Factory Alpha system", () => {
    const result = simulate({
      system,
      dailyKwhTarget: 850,
      startDate: new Date(2026, 4, 10),
      endDate: new Date(2026, 4, 16),
      seed: 11,
    });
    const byDay = sumByLocalDay(result.solarRows);
    expect(byDay.size).toBe(7);
    for (const kwh of byDay.values()) {
      // 100 kW system: clear day ≈ 500-650 kWh; cloudy ≥ 60% of that.
      expect(kwh).toBeGreaterThan(200);
      expect(kwh).toBeLessThan(700);
    }
  });

  it("Factory Alpha daily consumption averages near the 850 kWh target", () => {
    const result = simulate({
      system,
      dailyKwhTarget: 850,
      startDate: new Date(2026, 4, 10),
      endDate: new Date(2026, 4, 30), // 21 days incl. weekends
      seed: 13,
    });
    const byDay = sumByLocalDay(result.consumptionRows);
    expect(byDay.size).toBe(21);
    const avg =
      [...byDay.values()].reduce((s, v) => s + v, 0) / byDay.size;
    // Weekdays ≈ 850 × 0.94 (May) ≈ 799; weekends × 0.6 → blended ≈ 710.
    expect(avg).toBeGreaterThan(640);
    expect(avg).toBeLessThan(860);
  });

  it("maps demo scenario targets correctly", () => {
    expect(defaultDailyTarget("industrial")).toBe(850);
    expect(defaultDailyTarget("commercial")).toBe(300);
    expect(defaultDailyTarget("residential")).toBe(18);
  });
});
