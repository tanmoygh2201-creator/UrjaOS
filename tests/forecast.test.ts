import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeAccuracy,
  gradeAccuracy,
} from "@/lib/energy/forecast-metrics";
import {
  forecastConsumption,
  forecastSolar,
  learnConsumptionPattern,
  learnSolarPattern,
  MODEL_VERSION,
} from "@/lib/energy/forecast-engine";
import {
  getForecastPageData,
} from "@/lib/energy/forecast-service";
import type {
  ConsumptionReading,
  EnergySystem,
  Forecast,
  SolarReading,
} from "@/types/energy";

// ── Accuracy metrics ──────────────────────────────────────────────────────

describe("computeAccuracy", () => {
  it("returns zeros for no evaluated samples", () => {
    expect(computeAccuracy([])).toEqual({ mae: 0, rmse: 0, mape: 0, samples: 0 });
  });

  it("computes MAE, RMSE, MAPE exactly on a hand-derived case", () => {
    // pairs: (10 vs 8) → err 2; (10 vs 10) → 0; (4 vs 6) → −2
    const pairs = [
      { timestamp: "t1", predicted: 10, actual: 8 },
      { timestamp: "t2", predicted: 10, actual: 10 },
      { timestamp: "t3", predicted: 4, actual: 6 },
    ];
    const metrics = computeAccuracy(pairs);
    expect(metrics.samples).toBe(3);
    expect(metrics.mae).toBeCloseTo(4 / 3, 3);
    // RMSE = sqrt((4 + 0 + 4) / 3)
    expect(metrics.rmse).toBeCloseTo(Math.sqrt(8 / 3), 3);
    // MAPE = (25% + 0% + 33.33%)/3 — all actuals nonzero
    expect(metrics.mape).toBeCloseTo((25 + 0 + (2 / 6) * 100) / 3, 1);
  });

  it("excludes zero-actual hours from MAPE but keeps them in MAE/RMSE", () => {
    const pairs = [
      { timestamp: "t1", predicted: 3, actual: 0 }, // solar-at-night miss
      { timestamp: "t2", predicted: 10, actual: 8 },
    ];
    const metrics = computeAccuracy(pairs);
    expect(metrics.samples).toBe(2);
    expect(metrics.mae).toBeCloseTo(2.5, 3);
    // MAPE only from the second pair: 25%.
    expect(metrics.mape).toBeCloseTo(25, 1);
  });
});

describe("gradeAccuracy", () => {
  it("grades by MAPE with a poor floor when there are no samples", () => {
    expect(gradeAccuracy(9, 10)).toBe("excellent");
    expect(gradeAccuracy(15, 10)).toBe("good");
    expect(gradeAccuracy(30, 10)).toBe("fair");
    expect(gradeAccuracy(80, 10)).toBe("poor");
    expect(gradeAccuracy(0, 0)).toBe("poor");
  });
});

// ── Forecast engine ───────────────────────────────────────────────────────

/** 2026-09-07 is a Monday — deterministic anchor for hour-of-week tests. */
const MONDAY = new Date(2026, 8, 7); // local Monday, Sept 7 2026

function solarReading(dayOffset: number, hour: number, kwh: number): SolarReading {
  const d = new Date(MONDAY);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return {
    id: `solar-${dayOffset}-${hour}`,
    system_id: "sys-1",
    timestamp: d.toISOString(),
    generation_kw: kwh,
    energy_kwh: kwh,
    irradiance: null,
    temperature: null,
    created_at: d.toISOString(),
  } as SolarReading;
}

function consumptionReading(
  dayOffset: number,
  hour: number,
  kwh: number
): ConsumptionReading {
  const d = new Date(MONDAY);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return {
    id: `cons-${dayOffset}-${hour}`,
    system_id: "sys-1",
    timestamp: d.toISOString(),
    load_kw: kwh,
    energy_kwh: kwh,
    created_at: d.toISOString(),
  } as ConsumptionReading;
}

describe("learnSolarPattern + forecastSolar", () => {
  it("builds the envelope as the per-hour max and applies the clear-sky index", () => {
    // 3 identical clear days: 06..18, 5 kWh/h (10 at noon).
    const readings: SolarReading[] = [];
    for (let day = 0; day < 3; day += 1) {
      for (let hour = 6; hour <= 18; hour += 1) {
        readings.push(solarReading(day, hour, hour === 12 ? 10 : 5));
      }
    }
    const learning = learnSolarPattern(readings);
    expect(learning.historyDays).toBe(3);
    expect(learning.envelopeByHour[12]).toBeCloseTo(10, 3);
    expect(learning.envelopeByHour[3]).toBe(0); // night
    expect(learning.clearSkyIndex).toBeCloseTo(1, 3); // clear days

    // Forecast Monday of the next week.
    const points = forecastSolar(learning, 1, MONDAY);
    expect(points).toHaveLength(13); // hours 6..18
    expect(points.every((p) => p.forecastType === "solar")).toBe(true);
    expect(points.every((p) => p.predictedKwh > 0)).toBe(true);
    const noon = points.find((p) => new Date(p.timestamp).getHours() === 12)!;
    expect(noon.predictedKwh).toBeCloseTo(10, 3);
  });

  it("carries recent cloudiness forward via the clear-sky index", () => {
    const readings: SolarReading[] = [];
    // 5 clear days at 10 kWh noon … then 2 cloudy days at 50%.
    for (let day = 0; day < 5; day += 1) {
      for (let hour = 6; hour <= 18; hour += 1) {
        readings.push(solarReading(day, hour, 10));
      }
    }
    for (let day = 5; day < 7; day += 1) {
      for (let hour = 6; hour <= 18; hour += 1) {
        readings.push(solarReading(day, hour, 5));
      }
    }
    const learning = learnSolarPattern(readings);
    expect(learning.envelopeByHour[12]).toBeCloseTo(10, 3); // max stays clear-day
    // Latest 3 days = clear, cloudy, cloudy → (1 + 0.5 + 0.5)/3.
    expect(learning.clearSkyIndex).toBeCloseTo(2 / 3, 2);

    const points = forecastSolar(learning, 1, MONDAY);
    const noon = points.find((p) => new Date(p.timestamp).getHours() === 12)!;
    expect(noon.predictedKwh).toBeCloseTo(10 * (2 / 3), 1); // envelope × index
  });
});

describe("learnConsumptionPattern + forecastConsumption", () => {
  it("learns hour-of-week medians and projects the same weekday forward", () => {
    // 3 identical weeks: 10 kWh every hour → median 10 everywhere.
    const readings: ConsumptionReading[] = [];
    for (let day = 0; day < 21; day += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        readings.push(consumptionReading(day, hour, 10));
      }
    }
    const learning = learnConsumptionPattern(readings);
    expect(learning.historyDays).toBe(21);
    expect(learning.weeklyFactor).toBeCloseTo(1, 2);
    expect(learning.medianByHourOfWeek[0]).toBeCloseTo(10, 3);

    const points = forecastConsumption(learning, 1, MONDAY);
    expect(points).toHaveLength(24);
    expect(points.every((p) => p.predictedKwh > 0)).toBe(true);
  });

  it("applies the weekly factor when recent days run hotter", () => {
    const readings: ConsumptionReading[] = [];
    // 14 days at 10 kWh/h (240/day), then 7 days at 12 kWh/h (288/day).
    // Factor = 288 / ((14×240 + 7×288)/21) = 288/256 = 1.125.
    for (let day = 0; day < 14; day += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        readings.push(consumptionReading(day, hour, 10));
      }
    }
    for (let day = 14; day < 21; day += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        readings.push(consumptionReading(day, hour, 12));
      }
    }
    const learning = learnConsumptionPattern(readings);
    expect(learning.weeklyFactor).toBeCloseTo(1.125, 2);

    const points = forecastConsumption(learning, 1, MONDAY);
    const first = points.find(
      (p) => new Date(p.timestamp).getHours() === 0
    )!;
    // Hour-of-week median for Monday 00:00 is 10 (samples 10, 10, 12); × 1.125.
    expect(first.predictedKwh).toBeCloseTo(11.25, 1);
  });
});

// ── Service ───────────────────────────────────────────────────────────────

function makeSystem(): EnergySystem {
  return {
    id: "sys-1",
    user_id: "user-1",
    name: "Forecast Stub",
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
    electricity_tariff: { type: "flat", currency: "INR", rate: 8.5 },
    currency: "INR",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

/**
 * In-memory Supabase stub covering the queries the forecast service makes:
 * select (filtered), insert, delete, update, and head-count.
 */
function stubDb(state: {
  solar: SolarReading[];
  consumption: ConsumptionReading[];
  forecasts: Partial<Forecast>[];
}) {
  const selectLog: string[] = [];
  const writes: string[] = [];

  function matchRows(table: string): Record<string, unknown>[] {
    if (table === "solar_readings") return state.solar as unknown as Record<string, unknown>[];
    if (table === "consumption_readings") {
      return state.consumption as unknown as Record<string, unknown>[];
    }
    return state.forecasts as unknown as Record<string, unknown>[];
  }

  function makeBuilder(table: string) {
    const filters: Record<string, unknown> = {};
    const builder = {
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        selectLog.push(table);
        builder._count = opts?.count === "exact" && opts?.head === true;
        return builder;
      },
      insert: (rows: Record<string, unknown>[]) => {
        writes.push(`insert:${rows.length}`);
        state.forecasts.push(...(rows as Partial<Forecast>[]));
        return Promise.resolve({ data: null, error: null });
      },
      update: (patch: Record<string, unknown>) => {
        writes.push(`update:${JSON.stringify(patch)}`);
        return {
          eq: () => Promise.resolve({ data: null, error: null }),
        };
      },
      delete: () => {
        writes.push("delete");
        return {
          eq: () => ({
            eq: () => ({
              gte: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      },
      eq: (col: string, value: unknown) => {
        filters[col] = value;
        return builder;
      },
      lt: (col: string, value: unknown) => {
        filters[col] = value;
        return builder;
      },
      gte: (col: string, value: unknown) => {
        filters[col] = value;
        return builder;
      },
      not: (_col: string, _op: string, value: unknown) => {
        filters._notNull = value;
        return builder;
      },
      is: (col: string, value: unknown) => {
        filters[col] = value;
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      then: undefined,
      _count: false,
      // Awaited lazily by tests via getForecastPageData.
      [Symbol.toPrimitive]: undefined,
    };
    // Make the builder thenable with a resolved payload.
    Object.defineProperty(builder, "then", {
      value: (resolve: (v: unknown) => void) => {
        let rows = matchRows(table);
        if (filters.forecast_type !== undefined) {
          rows = rows.filter(
            (r) => (r as Record<string, unknown>).forecast_type === filters.forecast_type
          );
        }
        if (filters._notNull === "actual_value") {
          rows = rows.filter(
            (r) => (r as Record<string, unknown>).actual_value != null
          );
        }
        if (filters.actual_value === null) {
          rows = rows.filter(
            (r) => (r as Record<string, unknown>).actual_value == null
          );
        }
        if (filters.timestamp !== undefined) {
          // filters collapse across lt/gte — good enough for the fixture:
          // evaluated rows are past, upcoming rows are future.
          const isPast = filters.timestamp === "PAST";
          rows = rows.filter((r) => {
            const ts = (r as { timestamp: string }).timestamp;
            return isPast ? ts < "2099" : true;
          });
        }
        resolve({ data: builder._count ? null : rows, error: null, count: rows.length });
      },
      configurable: true,
    });
    return builder;
  }

  return {
    client: {
      from: (table: string) => makeBuilder(table),
    } as unknown as SupabaseClient,
    selectLog,
    writes,
  };
}

describe("forecast service (stubbed Supabase)", () => {
  it("reports no forecasts and no accuracy before any rows exist", async () => {
    const state = { solar: [], consumption: [], forecasts: [] };
    const { client } = stubDb(state);

    const data = await getForecastPageData(client, makeSystem(), "7d");

    expect(data.hasForecasts).toBe(false);
    expect(data.solar.accuracy).toBeNull();
    expect(data.consumption.accuracy).toBeNull();
    expect(data.modelVersion).toBe(MODEL_VERSION);
  });

  it("computes measured accuracy from evaluated forecast rows", async () => {
    // Two evaluated solar hours: perfect (10 vs 10) and 20% miss (10 vs 8).
    // Two evaluated consumption hours with known misses.
    const past = (hoursAgo: number): string => {
      const d = new Date();
      d.setHours(d.getHours() - hoursAgo, 0, 0, 0);
      return d.toISOString();
    };
    const state = {
      solar: [] as SolarReading[],
      consumption: [] as ConsumptionReading[],
      forecasts: [
        {
          id: "f1",
          system_id: "sys-1",
          forecast_type: "solar",
          timestamp: past(3),
          predicted_value: 10,
          actual_value: 10,
          model_version: MODEL_VERSION,
        },
        {
          id: "f2",
          system_id: "sys-1",
          forecast_type: "solar",
          timestamp: past(2),
          predicted_value: 10,
          actual_value: 8,
          model_version: MODEL_VERSION,
        },
        {
          id: "f3",
          system_id: "sys-1",
          forecast_type: "consumption",
          timestamp: past(3),
          predicted_value: 5,
          actual_value: 6,
          model_version: MODEL_VERSION,
        },
        {
          id: "f4",
          system_id: "sys-1",
          forecast_type: "consumption",
          timestamp: past(2),
          predicted_value: 5,
          actual_value: 4,
          model_version: MODEL_VERSION,
        },
      ] as Partial<Forecast>[],
    };
    const { client } = stubDb(state);

    const data = await getForecastPageData(client, makeSystem(), "7d");

    expect(data.solar.accuracy).not.toBeNull();
    expect(data.solar.accuracy!.samples).toBe(2);
    expect(data.solar.accuracy!.mae).toBeCloseTo(1, 3); // (0 + 2)/2
    expect(data.consumption.accuracy!.mae).toBeCloseTo(1, 3); // (1 + 1)/2
    // MAPE solar: (0% + 25%)/2 = 12.5% → grade "good".
    expect(data.solar.accuracy!.mape).toBeCloseTo(12.5, 1);
    expect(data.solar.accuracy!.grade).toBe("good");
  });
});
