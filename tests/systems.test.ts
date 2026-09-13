import { describe, expect, it } from "vitest";
import {
  energySystemSchema,
  validateEnergySystem,
} from "@/lib/validation/system";
import {
  getTariffRateForHour,
  type TariffConfigInput,
} from "@/lib/validation/tariff";
import {
  formatCurrency,
  formatKwh,
  formatKw,
  formatPercent,
  getCurrencySymbol,
} from "@/lib/energy/format";
import { formatTariffSummary } from "@/lib/energy/tariff";

const validSystem = {
  name: "Factory Alpha",
  location: "Pune, MH",
  systemType: "industrial",
  solarCapacityKw: "100",
  batteryCapacityKwh: "200",
  batteryMaxChargeKw: "50",
  batteryMaxDischargeKw: "50",
  minSoc: "10",
  maxSoc: "90",
  batteryChargeEfficiency: "0.95",
  batteryDischargeEfficiency: "0.95",
  tariff: { type: "flat", currency: "INR", rate: "8.5" },
  currency: "INR",
};

describe("energySystemSchema", () => {
  it("accepts a valid system and coerces numeric strings", () => {
    const result = validateEnergySystem(validSystem);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.solarCapacityKw).toBe(100);
      expect(result.data.tariff).toEqual({
        type: "flat",
        currency: "INR",
        rate: 8.5,
      });
    }
  });

  it("rejects negative solar capacity", () => {
    const result = validateEnergySystem({
      ...validSystem,
      solarCapacityKw: "-5",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.solarCapacityKw).toMatch(/negative/i);
  });

  it("rejects SOC values outside 0-100", () => {
    const low = validateEnergySystem({ ...validSystem, minSoc: "-1" });
    const high = validateEnergySystem({ ...validSystem, maxSoc: "101" });
    expect(low.ok).toBe(false);
    expect(high.ok).toBe(false);
  });

  it("rejects minSoc >= maxSoc (cross-field rule)", () => {
    const result = validateEnergySystem({
      ...validSystem,
      minSoc: "90",
      maxSoc: "10",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.minSoc).toMatch(/lower than/i);
  });

  it("rejects efficiencies above 1", () => {
    const result = validateEnergySystem({
      ...validSystem,
      batteryChargeEfficiency: "1.2",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.batteryChargeEfficiency).toMatch(/0\.50 and 1\.00/);
  });

  it("rejects an invalid currency code", () => {
    const result = validateEnergySystem({ ...validSystem, currency: "rupees" });
    expect(result.ok).toBe(false);
  });

  it("rejects a TOU tariff with zero periods", () => {
    const result = validateEnergySystem({
      ...validSystem,
      tariff: { type: "tou", currency: "INR", periods: [] },
    });
    expect(result.ok).toBe(false);
  });
});

describe("getTariffRateForHour", () => {
  const flat = { type: "flat", currency: "INR", rate: 8.5 } as const;

  it("returns the flat rate for every hour", () => {
    for (let h = 0; h < 24; h += 1) {
      expect(getTariffRateForHour(flat, h)).toBe(8.5);
    }
  });

  it("resolves TOU windows and the off-window default of 0", () => {
    const tou: TariffConfigInput = {
      type: "tou",
      currency: "INR",
      periods: [
        { name: "off-peak", startHour: 22, endHour: 6, rate: 5 },
        { name: "peak", startHour: 18, endHour: 22, rate: 12 },
      ],
    };

    expect(getTariffRateForHour(tou, 23)).toBe(5); // overnight wrap
    expect(getTariffRateForHour(tou, 2)).toBe(5);
    expect(getTariffRateForHour(tou, 6)).toBe(0); // window ends exclusive
    expect(getTariffRateForHour(tou, 18)).toBe(12);
    expect(getTariffRateForHour(tou, 21)).toBe(12);
  });

  it("lets later periods win on overlapping windows", () => {
    const tou: TariffConfigInput = {
      type: "tou",
      currency: "INR",
      periods: [
        { name: "a", startHour: 0, endHour: 12, rate: 4 },
        { name: "b", startHour: 6, endHour: 10, rate: 9 },
      ],
    };
    expect(getTariffRateForHour(tou, 8)).toBe(9);
    expect(getTariffRateForHour(tou, 4)).toBe(4);
  });
});

describe("formatters", () => {
  it("formats currency with the Indian grouping", () => {
    expect(formatCurrency(4820.5, "INR")).toBe("₹4,820.50");
    expect(formatCurrency(0, "INR", 0)).toBe("₹0");
  });

  it("maps currency codes to symbols", () => {
    expect(getCurrencySymbol("INR")).toBe("₹");
    expect(getCurrencySymbol("USD")).toBe("$");
    expect(getCurrencySymbol("XYZ")).toBe("XYZ");
  });

  it("formats energy and power values", () => {
    expect(formatKwh(42.8)).toBe("42.8 kWh");
    expect(formatKw(6.25)).toBe("6.25 kW");
    expect(formatPercent(78.4)).toBe("78%");
    expect(formatPercent(90.25, 1)).toBe("90.3%");
  });

  it("summarizes flat and TOU tariffs", () => {
    expect(formatTariffSummary({ type: "flat", currency: "INR", rate: 8.5 })).toBe(
      "₹8.50/kWh flat"
    );
    expect(
      formatTariffSummary({
        type: "tou",
        currency: "INR",
        periods: [{ name: "peak", startHour: 18, endHour: 22, rate: 12 }],
      })
    ).toBe("peak 18–22h @ ₹12.00");
  });
});

describe("schema invariants", () => {
  it("keeps unknown keys out of parsed output", () => {
    const parsed = energySystemSchema.parse({
      ...validSystem,
      hacked: "field",
    });
    expect("hacked" in parsed).toBe(false);
  });
});
