import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildReportCsv,
  buildReportInsights,
  getReportData,
  isReportPeriodKey,
  resolveReportWindow,
  type ReportData,
  type ReportInsightInput,
} from "@/lib/energy/report-service";
import type { EnergySystem } from "@/types/energy";

/**
 * Reports tests (Phase 12).
 *
 * The service delegates aggregation to the analytics engine (covered by the
 * analytics suite); here we verify report-specific logic with a faithful
 * stubbed client: period resolution, insight rules, CSV serialization, and
 * end-to-end assembly (window override, deltas, forecast accuracy, alerts).
 */

const PEAK = { name: "peak", startHour: 17, endHour: 22, rate: 12 };
const OFF_PEAK_A = { name: "day", startHour: 0, endHour: 17, rate: 6 };
const OFF_PEAK_B = { name: "night", startHour: 22, endHour: 24, rate: 6 };
const SYSTEM_ID = "sys-1";

function makeSystem(): EnergySystem {
  return {
    id: SYSTEM_ID,
    user_id: "user-1",
    name: "Report Stub",
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

function ts(daysAgo: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

// ── Faithful Supabase stub ──────────────────────────────────────────────────

interface SolarRow {
  system_id: string;
  timestamp: string;
  energy_kwh: number;
  [key: string]: unknown;
}
interface ConsumptionRow {
  system_id: string;
  timestamp: string;
  energy_kwh: number;
  load_kw: number;
  [key: string]: unknown;
}
interface BatteryRow {
  system_id: string;
  timestamp: string;
  charge_power: number;
  discharge_power: number;
  [key: string]: unknown;
}
interface GridRow {
  system_id: string;
  timestamp: string;
  import_kw: number;
  export_kw: number;
  [key: string]: unknown;
}
interface ForecastRow {
  system_id: string;
  forecast_type: string;
  timestamp: string;
  predicted_value: number;
  actual_value: number | null;
  [key: string]: unknown;
}
interface AlertRow {
  id: string;
  system_id: string;
  type: string;
  severity: string;
  message: string;
  is_resolved: boolean;
  created_at: string;
  [key: string]: unknown;
}

interface Tables {
  solar: SolarRow[];
  consumption: ConsumptionRow[];
  battery: BatteryRow[];
  grid: GridRow[];
  forecasts: ForecastRow[];
  alerts: AlertRow[];
}

/**
 * Builder that actually applies eq/gte/lt/not/in filters (PostgREST-style,
 * ISO strings compare lexicographically), supports head/count queries, and
 * resolves on range()/limit()/await. This lets the previous-period window
 * query return different rows than the current one — essential for deltas.
 */
function stubClient(tables: Tables): SupabaseClient {
  const rowsFor = (table: string): Record<string, unknown>[] => {
    switch (table) {
      case "solar_readings":
        return tables.solar;
      case "consumption_readings":
        return tables.consumption;
      case "battery_readings":
        return tables.battery;
      case "grid_readings":
        return tables.grid;
      case "forecasts":
        return tables.forecasts;
      case "alerts":
        return tables.alerts;
      default:
        return [];
    }
  };

  const makeBuilder = (getRows: () => Record<string, unknown>[]) => {
    let wantCount = false;
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    const apply = () => getRows().filter((row) => filters.every((f) => f(row)));
    const resolveWith = () =>
      wantCount
        ? { data: null, error: null, count: apply().length }
        : { data: apply(), error: null, count: null };

    const builder: Record<string, unknown> = {
      select: (
        _columns?: string,
        opts?: { count?: string; head?: boolean }
      ) => {
        if (opts?.count) wantCount = true;
        return builder;
      },
      eq: (col: string, val: unknown) => {
        filters.push((row) => row[col] === val);
        return builder;
      },
      gte: (col: string, val: unknown) => {
        filters.push((row) => String(row[col]) >= String(val));
        return builder;
      },
      lt: (col: string, val: unknown) => {
        filters.push((row) => String(row[col]) < String(val));
        return builder;
      },
      not: (col: string, _op: string, val: unknown) => {
        filters.push((row) => row[col] !== val);
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        filters.push((row) => vals.includes(row[col]));
        return builder;
      },
      order: () => builder,
      limit: () => Promise.resolve(resolveWith()),
      range: (from: number, to: number) =>
        Promise.resolve({
          ...resolveWith(),
          data: apply().slice(from, to + 1),
        }),
      then: (onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve(resolveWith()).then(onFulfilled),
    };
    return builder;
  };

  return {
    from: (table: string) => makeBuilder(() => rowsFor(table)),
  } as unknown as SupabaseClient;
}

// ── Fixture: one synthetic day ──────────────────────────────────────────────

/** 65 kWh solar, 120 kWh load, TOU-priced imports, noon export + battery. */
function buildDay(daysAgo: number): {
  solar: SolarRow[];
  consumption: ConsumptionRow[];
  battery: BatteryRow[];
  grid: GridRow[];
} {
  const solar: SolarRow[] = [];
  const consumption: ConsumptionRow[] = [];
  const battery: BatteryRow[] = [];
  const grid: GridRow[] = [];

  for (let hour = 0; hour < 24; hour += 1) {
    consumption.push({
      system_id: SYSTEM_ID,
      timestamp: ts(daysAgo, hour),
      energy_kwh: 5,
      load_kw: 5,
    });
  }
  for (const hour of [9, 10, 11, 13, 14]) {
    solar.push({ system_id: SYSTEM_ID, timestamp: ts(daysAgo, hour), energy_kwh: 10 });
  }
  solar.push({ system_id: SYSTEM_ID, timestamp: ts(daysAgo, 12), energy_kwh: 15 });
  battery.push({
    system_id: SYSTEM_ID,
    timestamp: ts(daysAgo, 12),
    charge_power: 5,
    discharge_power: 0,
  });
  for (const hour of [18, 19]) {
    battery.push({
      system_id: SYSTEM_ID,
      timestamp: ts(daysAgo, hour),
      charge_power: 0,
      discharge_power: 1.5,
    });
  }
  for (let hour = 0; hour < 24; hour += 1) {
    const solarKwh = hour === 12 ? 15 : [9, 10, 11, 13, 14].includes(hour) ? 10 : 0;
    const dischargeKwh = [18, 19].includes(hour) ? 1.5 : 0;
    grid.push({
      system_id: SYSTEM_ID,
      timestamp: ts(daysAgo, hour),
      import_kw: Math.max(0, 5 - solarKwh - dischargeKwh),
      export_kw: Math.max(0, solarKwh - 5),
    });
  }
  return { solar, consumption, battery, grid };
}

// ── Period selection ────────────────────────────────────────────────────────

describe("report period selection", () => {
  it("accepts only the defined period keys", () => {
    expect(isReportPeriodKey("daily")).toBe(true);
    expect(isReportPeriodKey("weekly")).toBe(true);
    expect(isReportPeriodKey("monthly")).toBe(true);
    expect(isReportPeriodKey("yearly")).toBe(false);
    expect(isReportPeriodKey(undefined)).toBe(false);
  });

  it("resolves daily/weekly/monthly windows with matching previous windows", () => {
    const daily = resolveReportWindow("daily");
    expect(daily.days).toBe(1);
    const weekly = resolveReportWindow("weekly");
    expect(weekly.days).toBe(7);
    const monthly = resolveReportWindow("monthly");
    expect(monthly.days).toBe(30);

    for (const w of [daily, weekly, monthly]) {
      // Previous window is equally long and directly abuts the current one.
      const gap =
        (w.startDay.getTime() - w.prevStartDay.getTime()) / 86_400_000 - w.days;
      expect(gap).toBe(0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date(w.startDay);
      end.setDate(end.getDate() + w.days - 1);
      expect(end.getTime()).toBe(today.getTime());
    }
  });
});

// ── Insight rules ───────────────────────────────────────────────────────────

describe("buildReportInsights", () => {
  const baseTotals = {
    solarKwh: 100,
    consumptionKwh: 200,
    gridImportKwh: 50,
    gridExportKwh: 0,
    batteryChargeKwh: 0,
    batteryDischargeKwh: 0,
    peakDemandKw: 5,
    avgDemandKw: 4,
    daysWithData: 7,
  };
  const baseMetrics: ReportInsightInput["metrics"] = {
    selfConsumptionPct: 90,
    gridDependencyPct: 25,
    solarUtilizationPct: 70,
    energyWastagePct: 0,
    batteryUtilizationPct: 10,
    estimatedSavings: 600,
  };
  const baseCost = {
    baselineCost: 900,
    actualGridCost: 300,
    solarSavings: 400,
    batterySavings: 200,
    estimatedSavings: 600,
  };
  const zeroDeltas: ReportInsightInput["deltas"] = {
    solar: { current: 0, previous: 0, changePct: null },
    consumption: { current: 0, previous: 0, changePct: null },
    gridImport: { current: 0, previous: 0, changePct: null },
    gridCost: { current: 0, previous: 0, changePct: null },
    estimatedSavings: { current: 0, previous: 0, changePct: null },
  };
  const quietAlerts = { openCount: 0, criticalCount: 0, raisedInPeriod: [] };

  function input(overrides: Partial<ReportInsightInput>): ReportInsightInput {
    return {
      systemName: "Factory Alpha",
      hasData: true,
      totals: baseTotals,
      metrics: baseMetrics,
      cost: baseCost,
      deltas: zeroDeltas,
      alerts: quietAlerts,
      forecast: [],
      ...overrides,
    };
  }

  it("reports no data neutrally and stops early", () => {
    const insights = buildReportInsights(input({ hasData: false }));
    expect(insights).toHaveLength(1);
    expect(insights[0].severity).toBe("neutral");
    expect(insights[0].title).toContain("No data");
  });

  it("flags rising savings as positive and falling as warning", () => {
    const up = buildReportInsights(
      input({
        deltas: {
          ...zeroDeltas,
          estimatedSavings: { current: 700, previous: 500, changePct: 40 },
        },
      })
    );
    const down = buildReportInsights(
      input({
        deltas: {
          ...zeroDeltas,
          estimatedSavings: { current: 400, previous: 500, changePct: -20 },
        },
      })
    );
    expect(up.some((i) => i.severity === "positive" && i.title.includes("up 40%"))).toBe(true);
    expect(down.some((i) => i.severity === "warning" && i.title.includes("down 20%"))).toBe(true);
  });

  it("flags grid cost spikes above 5% as warnings", () => {
    const insights = buildReportInsights(
      input({
        deltas: {
          ...zeroDeltas,
          gridImport: { current: 60, previous: 50, changePct: 20 },
          gridCost: { current: 350, previous: 300, changePct: 16.7 },
        },
      })
    );
    expect(insights.some((i) => i.title.includes("Grid import cost rose"))).toBe(true);
  });

  it("escalates solar wastage: warning above 15%, critical above 25%", () => {
    const warning = buildReportInsights(
      input({
        metrics: { ...baseMetrics, energyWastagePct: 18 },
        totals: { ...baseTotals, gridExportKwh: 18 },
      })
    );
    const critical = buildReportInsights(
      input({
        metrics: { ...baseMetrics, energyWastagePct: 30 },
        totals: { ...baseTotals, gridExportKwh: 30 },
      })
    );
    expect(warning.some((i) => i.severity === "warning" && i.title.includes("18%"))).toBe(true);
    expect(critical.some((i) => i.severity === "critical" && i.title.includes("30%"))).toBe(true);
  });

  it("celebrates high self-consumption as positive", () => {
    const insights = buildReportInsights(
      input({ metrics: { ...baseMetrics, selfConsumptionPct: 85 } })
    );
    expect(insights.some((i) => i.severity === "positive" && i.title.includes("85%"))).toBe(true);
  });

  it("escalates unresolved alerts when critical ones exist", () => {
    const plain = buildReportInsights(
      input({ alerts: { openCount: 3, criticalCount: 0, raisedInPeriod: [] } })
    );
    const critical = buildReportInsights(
      input({ alerts: { openCount: 3, criticalCount: 1, raisedInPeriod: [] } })
    );
    expect(plain.some((i) => i.severity === "warning" && i.title.includes("3 unresolved"))).toBe(true);
    expect(critical.some((i) => i.severity === "critical")).toBe(true);
  });

  it("judges solar forecast accuracy: good is positive, poor is warning", () => {
    const good = buildReportInsights(
      input({
        forecast: [{ type: "solar", mae: 0.5, mape: 8, samples: 24, grade: "excellent" }],
      })
    );
    const poor = buildReportInsights(
      input({
        forecast: [{ type: "solar", mae: 3, mape: 40, samples: 24, grade: "poor" }],
      })
    );
    expect(good.some((i) => i.severity === "positive" && i.title.includes("Solar forecast"))).toBe(true);
    expect(poor.some((i) => i.severity === "warning" && i.title.includes("poor"))).toBe(true);
  });

  it("sorts insights critical-first", () => {
    const insights = buildReportInsights(
      input({
        metrics: { ...baseMetrics, energyWastagePct: 30 },
        totals: { ...baseTotals, gridExportKwh: 30 },
        alerts: { openCount: 2, criticalCount: 0, raisedInPeriod: [] },
        deltas: {
          ...zeroDeltas,
          estimatedSavings: { current: 700, previous: 500, changePct: 40 },
        },
      })
    );
    const ranks = insights.map((i) => i.severity);
    const order = ["critical", "warning", "positive", "neutral"];
    for (let i = 1; i < ranks.length; i += 1) {
      expect(order.indexOf(ranks[i])).toBeGreaterThanOrEqual(
        order.indexOf(ranks[i - 1])
      );
    }
  });
});

// ── CSV serialization ───────────────────────────────────────────────────────

describe("buildReportCsv", () => {
  function makeReport(overrides?: {
    alerts?: ReportData["alerts"];
    daily?: ReportData["daily"];
  }): ReportData {
    return {
      system: makeSystem(),
      periodKey: "weekly",
      periodLabel: "Weekly",
      hasData: true,
      generatedAt: "2026-09-17T10:00:00.000Z",
      window: {
        fromDayKey: "2026-09-11",
        toDayKey: "2026-09-17",
        label: "11 Sep – 17 Sep",
      },
      totals: {
        solarKwh: 420,
        consumptionKwh: 840,
        gridImportKwh: 350,
        gridExportKwh: 30,
        batteryChargeKwh: 35,
        batteryDischargeKwh: 30,
        peakDemandKw: 5.2,
        avgDemandKw: 5,
        daysWithData: 7,
      },
      metrics: {
        selfConsumptionPct: 92.9,
        gridDependencyPct: 41.7,
        solarUtilizationPct: 59.3,
        energyWastagePct: 7.1,
        batteryUtilizationPct: 7.5,
        estimatedSavings: 3360,
      },
      cost: {
        baselineCost: 6090,
        actualGridCost: 2730,
        solarSavings: 2400,
        batterySavings: 960,
        estimatedSavings: 3360,
      },
      daily:
        overrides?.daily ??
        [
          {
            day: "2026-09-11",
            label: "11 Sep",
            solarKwh: 65,
            consumptionKwh: 120,
            gridImportKwh: 50,
            batteryChargeKwh: 5,
            batteryDischargeKwh: 4.5,
            cost: 390,
            savings: 480,
          },
        ],
      deltas: {
        solar: { current: 420, previous: 400, changePct: 5 },
        consumption: { current: 840, previous: 800, changePct: 5 },
        gridImport: { current: 350, previous: 340, changePct: 2.9 },
        gridCost: { current: 2730, previous: 2600, changePct: 5 },
        estimatedSavings: { current: 3360, previous: 3200, changePct: 5 },
      },
      forecast: null,
      alerts:
        overrides?.alerts ?? {
          openCount: 1,
          criticalCount: 0,
          raisedInPeriod: [
            {
              type: "solar_wastage",
              severity: "medium",
              message: 'Solar waste on "2026-09-12": export',
              is_resolved: false,
              created_at: "2026-09-12T03:00:00.000Z",
            },
          ],
        },
      insights: [],
    };
  }

  it("serializes summary, daily, and alerts sections with proper escaping", () => {
    const csv = buildReportCsv(makeReport());
    const lines = csv.split("\n");

    expect(csv).toContain("Summary");
    expect(csv).toContain("Daily breakdown");
    expect(csv).toContain("Alerts raised in period");

    // Escaping: the quoted message (contains a comma) survives round-trip.
    const messageLine = lines.find((l) => l.includes("Solar waste"));
    expect(messageLine).toBeDefined();
    expect(messageLine).toContain('"Solar waste on ""2026-09-12"": export"');

    // Values land in the right sections.
    expect(csv).toContain("System,Report Stub");
    expect(csv).toContain("Solar (kWh),420");
    expect(csv).toContain("2026-09-11,65,120,50,5,4.5,390,480");
  });

  it("omits the alerts section when nothing was raised", () => {
    const csv = buildReportCsv(
      makeReport({
        alerts: { openCount: 0, criticalCount: 0, raisedInPeriod: [] },
      })
    );
    expect(csv).not.toContain("Alerts raised in period");
    expect(csv).toContain("Daily breakdown");
  });
});

// ── End-to-end assembly ─────────────────────────────────────────────────────

describe("getReportData assembly", () => {
  const empty: Tables = {
    solar: [],
    consumption: [],
    battery: [],
    grid: [],
    forecasts: [],
    alerts: [],
  };

  it("returns hasData=false with only the no-data insight for an empty system", async () => {
    const report = await getReportData(stubClient(empty), makeSystem(), "weekly");
    expect(report.hasData).toBe(false);
    expect(report.daily).toEqual([]);
    expect(report.insights).toHaveLength(1);
    expect(report.insights[0].title).toContain("No data");
    expect(report.deltas.solar.changePct).toBeNull();
    expect(report.forecast).toBeNull();
    expect(report.alerts.openCount).toBe(0);
  });

  it("aggregates two days with deltas, forecast accuracy, and alert counts", async () => {
    const day1 = buildDay(1);
    const day2 = buildDay(2);
    const tables: Tables = {
      solar: [...day1.solar, ...day2.solar],
      consumption: [...day1.consumption, ...day2.consumption],
      battery: [...day1.battery, ...day2.battery],
      grid: [...day1.grid, ...day2.grid],
      forecasts: [
        // Solar: predicted 10 vs 10, 8 vs 10 → MAE 1, MAPE 10 → "excellent".
        {
          system_id: SYSTEM_ID,
          forecast_type: "solar",
          timestamp: ts(1, 12),
          predicted_value: 10,
          actual_value: 10,
        },
        {
          system_id: SYSTEM_ID,
          forecast_type: "solar",
          timestamp: ts(1, 13),
          predicted_value: 8,
          actual_value: 10,
        },
        // Unevaluated rows must be excluded from accuracy.
        {
          system_id: SYSTEM_ID,
          forecast_type: "solar",
          timestamp: ts(1, 14),
          predicted_value: 9,
          actual_value: null,
        },
        // Out-of-window (older than 7 days) must be excluded.
        {
          system_id: SYSTEM_ID,
          forecast_type: "solar",
          timestamp: ts(30, 12),
          predicted_value: 5,
          actual_value: 50,
        },
      ],
      alerts: [
        {
          id: "a1",
          system_id: SYSTEM_ID,
          type: "solar_wastage",
          severity: "medium",
          message: "Wastage yesterday",
          is_resolved: false,
          created_at: ts(1, 3),
        },
        {
          id: "a2",
          system_id: SYSTEM_ID,
          type: "battery_low_soc",
          severity: "high",
          message: "Old resolved alert",
          is_resolved: true,
          created_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "a3",
          system_id: SYSTEM_ID,
          type: "grid_dependency",
          severity: "high",
          message: "Open critical alert",
          is_resolved: false,
          created_at: "2026-01-02T00:00:00.000Z",
        },
      ],
    };

    const report = await getReportData(stubClient(tables), makeSystem(), "weekly");

    expect(report.hasData).toBe(true);
    expect(report.periodKey).toBe("weekly");

    // Two identical days: 65 solar (60 + 5 noon... wait, noon is 15) → 65? No:
    // hours 9–11, 13–14 give 10 each (50) plus noon 15 → 65 kWh/day.
    expect(report.totals.solarKwh).toBeCloseTo(130, 1);
    expect(report.totals.consumptionKwh).toBeCloseTo(240, 1);
    // Imports: 18 non-solar hours × 5 = 90, minus 1.5 discharge at 18/19 → 87/day.
    expect(report.totals.gridImportKwh).toBeCloseTo(174, 1);
    // Exports: 5 kWh at each of hours 9–11/13–14, 10 kWh at noon → 35/day.
    expect(report.totals.gridExportKwh).toBeCloseTo(70, 1);
    expect(report.totals.batteryChargeKwh).toBeCloseTo(10, 1);
    expect(report.totals.batteryDischargeKwh).toBeCloseTo(6, 1);
    expect(report.totals.daysWithData).toBe(2);

    // Deltas vs the equally-long previous window (no data → null change).
    expect(report.deltas.solar.changePct).toBeNull();
    expect(report.deltas.solar.current).toBeCloseTo(130, 1);
    expect(report.deltas.solar.previous).toBe(0);

    // Forecast summary: 2 evaluated in-window pairs only.
    expect(report.forecast).not.toBeNull();
    expect(report.forecast!.samples).toBe(2);
    expect(report.forecast!.mae).toBeCloseTo(1, 1);
    expect(report.forecast!.mape).toBeCloseTo(10, 1);
    expect(report.forecast!.grade).toBe("excellent");

    // Alerts: 2 open, 1 critical high-severity, 1 raised in-period.
    expect(report.alerts.openCount).toBe(2);
    expect(report.alerts.criticalCount).toBe(1);
    expect(report.alerts.raisedInPeriod).toHaveLength(1);

    // Insights include the open-alerts item (critical due to high severity).
    expect(
      report.insights.some(
        (i) => i.severity === "critical" && i.title.includes("2 unresolved")
      )
    ).toBe(true);
  });
});
