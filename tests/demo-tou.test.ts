import { describe, expect, it } from "vitest";
import { DEMO_SCENARIOS } from "@/lib/simulation/demo";
import { demoSeedSchema } from "@/lib/validation/simulation";
import {
  planOptimalSchedule,
  type PlanHourInput,
} from "@/lib/energy/optimizer";
import type { EnergySystem, TariffConfig } from "@/types/energy";

/** Narrows a tariff config to the TOU variant (throws otherwise). */
function asTou(tariff: TariffConfig): Extract<TariffConfig, { type: "tou" }> {
  if (tariff.type !== "tou") throw new Error("Expected a TOU tariff");
  return tariff;
}

describe("demo scenario presets", () => {
  it("keeps Factory Alpha as the canonical flat-tariff demo", () => {
    const alpha = DEMO_SCENARIOS.find((s) => s.key === "factory-alpha");
    expect(alpha).toBeDefined();
    expect(alpha!.system.electricity_tariff.type).toBe("flat");
    expect(alpha!.system.name).toBe("Factory Alpha");
  });

  it("offers a TOU twin with the same plant but a peak window", () => {
    const alpha = DEMO_SCENARIOS.find((s) => s.key === "factory-alpha")!;
    const tou = DEMO_SCENARIOS.find((s) => s.key === "factory-alpha-tou");
    expect(tou).toBeDefined();
    expect(tou!.system.name).toBe("Factory Alpha TOU");
    expect(tou!.system.electricity_tariff.type).toBe("tou");
    // Same physical plant as Factory Alpha.
    expect(tou!.system.solar_capacity_kw).toBe(alpha.system.solar_capacity_kw);
    expect(tou!.system.battery_capacity_kwh).toBe(alpha.system.battery_capacity_kwh);
    expect(tou!.dailyKwhTarget).toBe(alpha.dailyKwhTarget);
    // TOU economics: peak ≥ 1.25 × off-peak so arbitrage is enabled.
    const periods = asTou(tou!.system.electricity_tariff).periods;
    const rates = periods.map((p) => p.rate);
    expect(Math.max(...rates)).toBeGreaterThanOrEqual(
      Math.min(...rates) * 1.25
    );
    // The off-peak window wraps midnight (22 → 17) so cheap charging covers
    // the hours before the 17:00 peak.
    const offPeak = periods.find((p) => p.name === "off-peak")!;
    expect(offPeak.startHour).toBeGreaterThan(offPeak.endHour);
  });

  it("schema accepts only known scenario keys", () => {
    expect(demoSeedSchema.safeParse({ scenario: "factory-alpha" }).success).toBe(true);
    expect(demoSeedSchema.safeParse({ scenario: "factory-alpha-tou" }).success).toBe(true);
    expect(demoSeedSchema.safeParse({ scenario: "factory-alpha-tou" }).data?.scenario).toBe(
      "factory-alpha-tou"
    );
    expect(demoSeedSchema.safeParse({ scenario: "made-up-key" }).success).toBe(false);
    // Default still resolves to Factory Alpha.
    expect(demoSeedSchema.parse({}).scenario).toBe("factory-alpha");
  });
});

describe("optimizer under the Factory Alpha TOU tariff", () => {
  const tou = DEMO_SCENARIOS.find((s) => s.key === "factory-alpha-tou")!;
  const system: EnergySystem = {
    id: "00000000-0000-0000-0000-000000000002",
    user_id: "user-1",
    ...tou.system,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  function touHour(
    dayOffset: number,
    hourOfDay: number,
    solarKwh: number,
    consumptionKwh: number
  ): PlanHourInput {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hourOfDay, 0, 0, 0);
    const periods = asTou(tou.system.electricity_tariff).periods;
    const inPeak = periods
      .filter((p) => p.name === "peak")
      .some((p) =>
        p.startHour <= p.endHour
          ? hourOfDay >= p.startHour && hourOfDay < p.endHour
          : hourOfDay >= p.startHour || hourOfDay < p.endHour
      );
    return {
      timestamp: d.toISOString(),
      solarKwh,
      consumptionKwh,
      tariffRate: inPeak ? 14 : 5,
    };
  }

  it("produces strictly positive savings from real arbitrage", () => {
    // Factory Alpha shape: 09:00 industrial ramp (peak ≈ 35 kW), 850 kWh/day.
    const shape = [
      0.55, 0.52, 0.5, 0.5, 0.52, 0.6, 0.72, 0.85, 0.95, 1.0, 1.0, 0.98, 0.9,
      0.95, 0.98, 1.0, 0.98, 0.92, 0.8, 0.7, 0.65, 0.62, 0.6, 0.58,
    ];
    const hours: PlanHourInput[] = [];
    for (let day = 0; day < 2; day += 1) {
      for (let h = 0; h < 24; h += 1) {
        hours.push(
          touHour(
            day + 1,
            h,
            h >= 6 && h <= 18 ? 35 : 0, // 100 kW plant, modest day
            shape[h] * 35.4 // normalizes the shape to ~850 kWh/day
          )
        );
      }
    }

    const plan = planOptimalSchedule(system, hours, 50);

    expect(plan.summary.arbitrageEnabled).toBe(true);
    expect(plan.summary.expectedSaving).toBeGreaterThan(0);
    expect(plan.summary.totalDischargeKwh).toBeGreaterThan(0);
    // Every discharge happens at the peak rate; every grid charge at off-peak.
    for (const row of plan.schedule) {
      if (row.dischargePowerKw > 0) expect(row.tariffRate).toBe(14);
      if (row.action === "grid") expect(row.tariffRate).toBe(5);
    }
    // Constraint safety holds under the demo config too.
    for (const row of plan.schedule) {
      expect(row.soc).toBeGreaterThanOrEqual(10);
      expect(row.soc).toBeLessThanOrEqual(90);
      expect(row.chargePowerKw > 0 && row.dischargePowerKw > 0).toBe(false);
    }
  });
});
