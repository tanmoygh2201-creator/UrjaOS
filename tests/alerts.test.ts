import { describe, expect, it } from "vitest";
import {
  ALERT_THRESHOLDS,
  billVerdictMessage,
  checkCommunicationGap,
  checkImportSpike,
  checkLowBattery,
  checkSolarWastage,
  classifyBill,
  type DailyStats,
} from "@/lib/energy/alert-engine";
import { buildDailyStats, evaluateRules } from "@/lib/energy/alert-service";
import { localDayKey } from "@/lib/energy/time";

/** Hand-built day stats with sensible defaults for rule tests. */
function day(overrides: Partial<DailyStats> = {}): DailyStats {
  return {
    dayKey: "2026-09-01",
    solarKwh: 100,
    consumptionKwh: 120,
    gridImportKwh: 30,
    gridExportKwh: 5,
    maxChargeKw: 0,
    maxDischargeKw: 0,
    endSoc: 60,
    hasReadings: true,
    ...overrides,
  };
}

describe("checkSolarWastage", () => {
  it("ignores days with little solar or no readings", () => {
    expect(checkSolarWastage(day({ hasReadings: false }))).toBeNull();
    expect(checkSolarWastage(day({ solarKwh: 5, gridExportKwh: 5 }))).toBeNull();
  });

  it("passes when exports stay under the threshold", () => {
    // 20% exported < 25% threshold.
    expect(checkSolarWastage(day({ gridExportKwh: 20 }))).toBeNull();
  });

  it("raises medium at the threshold and high above 50%", () => {
    const medium = checkSolarWastage(day({ gridExportKwh: 30 }));
    expect(medium).not.toBeNull();
    expect(medium?.severity).toBe("medium");
    expect(medium?.type).toBe("solar_wastage");
    expect(medium?.dedupKey).toBe("solar_wastage:2026-09-01");

    const high = checkSolarWastage(day({ gridExportKwh: 60 }));
    expect(high?.severity).toBe("high");
    expect(high?.message).toContain("60%");
  });
});

describe("checkLowBattery", () => {
  it("needs a SOC reading", () => {
    expect(checkLowBattery(day({ endSoc: null }))).toBeNull();
    expect(checkLowBattery(day({ endSoc: 45 }))).toBeNull();
  });

  it("escalates severity below 10%", () => {
    expect(checkLowBattery(day({ endSoc: 15 }))?.severity).toBe("medium");
    expect(checkLowBattery(day({ endSoc: 8 }))?.severity).toBe("high");
    expect(checkLowBattery(day({ endSoc: 8 }))?.dedupKey).toBe(
      "low_battery:2026-09-01"
    );
  });
});

describe("checkCommunicationGap", () => {
  it("requires consecutive empty days before alerting", () => {
    expect(checkCommunicationGap(day({ hasReadings: false }), 0)).toBeNull();
    expect(checkCommunicationGap(day({ hasReadings: false }), 1)).toBeNull();
  });

  it("escalates after several silent days and never re-keys per day", () => {
    const low = checkCommunicationGap(day({ hasReadings: false }), 2);
    expect(low?.severity).toBe("low");
    expect(low?.dedupKey).toBe("communication_gap");

    const high = checkCommunicationGap(day({ hasReadings: false }), 5);
    expect(high?.severity).toBe("high");
    expect(high?.message).toContain("5 consecutive days");
  });
});

describe("checkImportSpike", () => {
  const baseline = [day(), day(), day()];

  it("needs usable baseline days", () => {
    expect(checkImportSpike(day(), [])).toBeNull();
    expect(
      checkImportSpike(day(), [day({ hasReadings: false })])
    ).toBeNull();
  });

  it("ignores tiny baselines and sub-threshold spikes", () => {
    expect(
      checkImportSpike(day(), [day({ gridImportKwh: 2 })])
    ).toBeNull();
    // 1.2× the baseline < 1.5× threshold.
    expect(checkImportSpike(day({ gridImportKwh: 36 }), baseline)).toBeNull();
  });

  it("flags high at 1.5× and critical at 2×", () => {
    const high = checkImportSpike(day({ gridImportKwh: 50 }), baseline);
    expect(high?.severity).toBe("high");
    expect(high?.dedupKey).toBe("import_spike:2026-09-01");
    expect(high?.message).toContain("167% of the 3-day average");

    const critical = checkImportSpike(day({ gridImportKwh: 70 }), baseline);
    expect(critical?.severity).toBe("critical");
  });
});

describe("classifyBill", () => {
  it("accepts bills within ±10% of the estimate", () => {
    expect(classifyBill(1050, 1000).status).toBe("within");
    expect(classifyBill(950, 1000).status).toBe("within");
  });

  it("flags over- and under-billing past the tolerance", () => {
    expect(classifyBill(1200, 1000).status).toBe("over");
    expect(classifyBill(800, 1000).status).toBe("under");
  });

  it("handles zero estimates without dividing by zero", () => {
    expect(classifyBill(100, 0).status).toBe("over");
    expect(classifyBill(0, 0).status).toBe("within");
  });

  it("renders a human message with the difference", () => {
    const verdict = classifyBill(1200, 1000);
    expect(billVerdictMessage(verdict, "₹", "2026-08")).toContain("₹200.00 more");
    expect(billVerdictMessage(classifyBill(1000, 1000), "₹", "2026-08")).toContain(
      "matches"
    );
  });
});

describe("buildDailyStats", () => {
  it("buckets hourly rows into local days with end-of-day SOC", () => {
    // Local timestamps: day 1 at 10:00 and 23:00, day 2 at 06:00.
    const ts = (dayOfMonth: number, hour: number): string => {
      const d = new Date(2026, 8, dayOfMonth, hour, 0, 0, 0);
      return d.toISOString();
    };
    const day1 = localDayKey(new Date(2026, 8, 1, 12));
    const day2 = localDayKey(new Date(2026, 8, 2, 12));

    const stats = buildDailyStats(
      [
        { timestamp: ts(1, 10), energy_kwh: 4 },
        { timestamp: ts(1, 11), energy_kwh: 6 },
        { timestamp: ts(2, 6), energy_kwh: 2 },
      ],
      [{ timestamp: ts(1, 10), energy_kwh: 3 }],
      [
        { timestamp: ts(1, 10), import_kw: 1.5, export_kw: 0.5 },
        { timestamp: ts(1, 11), import_kw: 1, export_kw: 0.25 },
      ],
      [
        { timestamp: ts(1, 10), soc: 80, charge_power: 2, discharge_power: 0 },
        { timestamp: ts(1, 23), soc: 64, charge_power: 0, discharge_power: 3 },
        { timestamp: ts(2, 6), soc: 66, charge_power: 1, discharge_power: 0 },
      ],
      [day1, day2]
    );

    expect(stats).toHaveLength(2);
    expect(stats[0].dayKey).toBe(day1);
    expect(stats[0].solarKwh).toBeCloseTo(10, 6);
    expect(stats[0].consumptionKwh).toBeCloseTo(3, 6);
    expect(stats[0].gridImportKwh).toBeCloseTo(2.5, 6);
    expect(stats[0].gridExportKwh).toBeCloseTo(0.75, 6);
    expect(stats[0].maxChargeKw).toBeCloseTo(2, 6);
    expect(stats[0].maxDischargeKw).toBeCloseTo(3, 6);
    expect(stats[0].endSoc).toBe(64); // last battery row of day 1
    expect(stats[0].hasReadings).toBe(true);

    expect(stats[1].solarKwh).toBeCloseTo(2, 6);
    expect(stats[1].gridImportKwh).toBe(0);
    expect(stats[1].endSoc).toBe(66);
    expect(stats[1].hasReadings).toBe(true);
  });

  it("marks days with no rows as empty", () => {
    const emptyDay = localDayKey(new Date(2026, 8, 3, 12));
    const stats = buildDailyStats([], [], [], [], [emptyDay]);
    expect(stats[0].hasReadings).toBe(false);
    expect(stats[0].endSoc).toBeNull();
  });
});

describe("evaluateRules", () => {
  it("collects candidates across days in order", () => {
    const stats = [
      day({ dayKey: "2026-09-01", gridExportKwh: 60, endSoc: 60 }), // wastage only
      day({ dayKey: "2026-09-02", gridExportKwh: 1, endSoc: 8 }), // low battery only
      day({ dayKey: "2026-09-03", gridExportKwh: 1, endSoc: 60 }), // clean
    ];
    const candidates = evaluateRules(stats);
    expect(candidates.map((c) => c.type)).toEqual([
      "solar_wastage",
      "low_battery",
    ]);
  });

  it("uses the 7 trailing days as the spike baseline", () => {
    const history = Array.from({ length: 7 }, (_, i) =>
      day({ dayKey: `2026-08-2${i + 1}`, gridImportKwh: 20 })
    );
    const spike = day({
      dayKey: "2026-09-01",
      gridImportKwh: 50, // 2.5× baseline → critical
    });
    const candidates = evaluateRules([...history, spike]);
    const spikes = candidates.filter((c) => c.type === "import_spike");
    expect(spikes).toHaveLength(1);
    expect(spikes[0].severity).toBe("critical");
  });

  it("respects the import floor so quiet systems stay quiet", () => {
    const history = Array.from({ length: 7 }, (_, i) =>
      day({ dayKey: `2026-08-2${i + 1}`, gridImportKwh: 2 })
    );
    const spike = day({ dayKey: "2026-09-01", gridImportKwh: 8 }); // 4× but baseline < 5 kWh
    expect(
      evaluateRules([...history, spike]).filter((c) => c.type === "import_spike")
    ).toHaveLength(0);
  });

  it("documents the threshold constants used above", () => {
    // Guards against silent threshold drift breaking the intent of these tests.
    expect(ALERT_THRESHOLDS.wastageExportFraction).toBe(0.25);
    expect(ALERT_THRESHOLDS.importSpikeFraction).toBe(1.5);
    expect(ALERT_THRESHOLDS.lowSocPct).toBe(20);
    expect(ALERT_THRESHOLDS.staleDays).toBe(2);
    expect(ALERT_THRESHOLDS.baselineDays).toBe(7);
  });
});
