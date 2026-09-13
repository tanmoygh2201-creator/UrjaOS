import { describe, expect, it } from "vitest";
import {
  calculateBaselineCost,
  calculateBatterySavings,
  calculateEnergyWastage,
  calculateEstimatedSavings,
  calculateGridCost,
  calculateGridDependency,
  calculateSelfConsumption,
  calculateSolarSavings,
  calculateSolarUtilization,
  calculateTotalEnergyCost,
} from "@/lib/energy/cost";
import { localDayKey, localHour } from "@/lib/energy/time";

describe("calculateGridCost", () => {
  it("multiplies import by tariff rate", () => {
    expect(calculateGridCost(10, 8.5)).toBe(85);
  });

  it("returns 0 for zero or negative import", () => {
    expect(calculateGridCost(0, 8.5)).toBe(0);
    expect(calculateGridCost(-5, 8.5)).toBe(0);
  });

  it("never produces negative cost for negative rates", () => {
    expect(calculateGridCost(10, -3)).toBe(0);
  });
});

describe("calculateSolarSavings", () => {
  it("values solar served to load at the tariff", () => {
    expect(calculateSolarSavings(10, 8, 8.5)).toBeCloseTo(68, 2);
  });

  it("ignores solar above consumption (export is not 'avoided cost')", () => {
    expect(calculateSolarSavings(15, 8, 8.5)).toBeCloseTo(68, 2);
  });

  it("returns 0 with no consumption", () => {
    expect(calculateSolarSavings(10, 0, 8.5)).toBe(0);
  });
});

describe("calculateBatterySavings", () => {
  it("values discharge at the tariff", () => {
    expect(calculateBatterySavings(5, 12)).toBe(60);
    expect(calculateBatterySavings(0, 12)).toBe(0);
  });
});

describe("calculateEstimatedSavings", () => {
  it("sums avoided grid energy without double counting", () => {
    expect(
      calculateEstimatedSavings({
        solarServedKwh: 10,
        batteryServedKwh: 5,
        tariffRate: 8.5,
      })
    ).toBeCloseTo(127.5, 2);
  });

  it("treats negative inputs as zero", () => {
    expect(
      calculateEstimatedSavings({
        solarServedKwh: -4,
        batteryServedKwh: 5,
        tariffRate: 8.5,
      })
    ).toBeCloseTo(42.5, 2);
  });
});

describe("calculateTotalEnergyCost", () => {
  it("sums per-interval costs across different rates", () => {
    const cost = calculateTotalEnergyCost([
      { kwh: 2, tariffRate: 5 },
      { kwh: 3, tariffRate: 10 },
    ]);
    expect(cost).toBeCloseTo(40, 2);
  });
});

describe("calculateSelfConsumption", () => {
  it("returns 100% when nothing is exported", () => {
    expect(calculateSelfConsumption(50, 0)).toBe(100);
  });

  it("returns 0% when everything is exported", () => {
    expect(calculateSelfConsumption(50, 50)).toBe(0);
  });

  it("handles partial export", () => {
    expect(calculateSelfConsumption(50, 12.5)).toBeCloseTo(75, 5);
  });

  it("returns 0 for zero generation", () => {
    expect(calculateSelfConsumption(0, 0)).toBe(0);
  });

  it("caps export at generation", () => {
    expect(calculateSelfConsumption(50, 80)).toBe(0);
  });
});

describe("calculateSolarUtilization", () => {
  it("covers load with solar first, then battery", () => {
    expect(
      calculateSolarUtilization({
        solarKwh: 8,
        batteryDischargeKwh: 2,
        consumptionKwh: 10,
      })
    ).toBe(100);
  });

  it("caps coverage at consumption", () => {
    expect(
      calculateSolarUtilization({
        solarKwh: 12,
        batteryDischargeKwh: 5,
        consumptionKwh: 10,
      })
    ).toBe(100);
  });

  it("is partial when imports remain", () => {
    expect(
      calculateSolarUtilization({
        solarKwh: 4,
        batteryDischargeKwh: 1,
        consumptionKwh: 10,
      })
    ).toBeCloseTo(50, 5);
  });
});

describe("calculateGridDependency", () => {
  it("is the import share of consumption", () => {
    expect(calculateGridDependency(4, 10)).toBeCloseTo(40, 5);
    expect(calculateGridDependency(0, 10)).toBe(0);
    expect(calculateGridDependency(12, 10)).toBe(100);
    expect(calculateGridDependency(5, 0)).toBe(0);
  });
});

describe("calculateEnergyWastage", () => {
  it("is the exported share of generation", () => {
    expect(calculateEnergyWastage(50, 10)).toBeCloseTo(20, 5);
    expect(calculateEnergyWastage(0, 10)).toBe(0);
    expect(calculateEnergyWastage(50, 60)).toBe(100);
  });
});

describe("calculateBaselineCost", () => {
  it("prices the whole consumption at the tariff", () => {
    expect(calculateBaselineCost(100, 8.5)).toBeCloseTo(850, 2);
  });
});

describe("time helpers", () => {
  // 2026-09-14 20:30 UTC == 2026-09-15 02:00 IST (+5:30): crosses the UTC day.
  const crosser = "2026-09-14T20:30:00Z";

  it("localDayKey buckets by the local day, not the UTC day", () => {
    expect(localDayKey(crosser)).toBe("2026-09-15"); // local IST day
    expect(crosser.slice(0, 10)).toBe("2026-09-14"); // what naive code gets
  });

  it("localHour returns the local hour", () => {
    expect(localHour(crosser)).toBe(2);
  });
});
