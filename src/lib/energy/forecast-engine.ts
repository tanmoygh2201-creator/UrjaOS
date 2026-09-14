/**
 * Baseline-v1 forecast engine (spec §34).
 *
 * Learns hour-of-week patterns from recent readings and projects them
 * forward. Deliberately simple, transparent, and honest — this is the
 * baseline that later models (weather-aware, ML) must beat.
 *
 * ── Solar ──────────────────────────────────────────────────────────────────
 * Two-layer model over hourly readings:
 *   clear-sky envelope × clear-sky index
 * The envelope is learned per hour-of-day as the observed maximum across
 * recent same-solar-season days (solar altitude varies slowly, so this is
 * the ceiling for each hour). The clear-sky index (actual ÷ envelope,
 * capped at 1.5) captures recent cloudiness and is forecast as the mean of
 * the last 3 days with data (persistence of weather).
 *
 * ── Consumption ────────────────────────────────────────────────────────────
 * Per hour-of-week (168 slots, Monday = 0) median of the lookback window,
 * scaled by a weekly seasonality factor: mean of the last 7 local days ÷
 * mean of the full window (clamped to [0.67, 1.5]), so persistent load
 * growth or shrinkage carries forward.
 */
import type { ConsumptionReading, SolarReading } from "@/types/energy";

export const MODEL_VERSION = "baseline-v1";

export interface SolarLearning {
  /** Learned clear-sky output per hour-of-day, kWh (0 for night hours). */
  envelopeByHour: number[];
  /** Recent cloudiness signal — mean clear-sky index of the latest 3 days. */
  clearSkyIndex: number;
  /** Days of history used to learn the envelope (0 → no history at all). */
  historyDays: number;
}

export interface ConsumptionLearning {
  /** Learned kWh per hour-of-week slot (0 = Monday 00:00 … 167). */
  medianByHourOfWeek: number[];
  /** Weekly seasonality factor applied on top of the medians. */
  weeklyFactor: number;
  /** Days of history used (0 → no history at all). */
  historyDays: number;
}

export interface ForecastPoint {
  timestamp: string; // ISO
  forecastType: "solar" | "consumption";
  predictedKwh: number;
}

// ── Solar learning ────────────────────────────────────────────────────────

/**
 * Learns the solar clear-sky envelope and recent cloudiness from readings.
 * Groups by local day, takes the per-hour MAX over all days (observed clear
 * ceiling), then averages the clear-sky index of the latest 3 days with data.
 */
export function learnSolarPattern(readings: SolarReading[]): SolarLearning {
  const envelopeByHour = new Array<number>(24).fill(0);
  const perDayHour = new Map<string, number[]>(); // dayKey -> kWh by hour

  for (const row of readings) {
    const d = new Date(row.timestamp);
    const dayKey = localDayKeyOf(d);
    const hour = d.getHours();
    let hours = perDayHour.get(dayKey);
    if (!hours) {
      hours = new Array<number>(24).fill(0);
      perDayHour.set(dayKey, hours);
    }
    hours[hour] += row.energy_kwh;
  }

  for (const hours of perDayHour.values()) {
    for (let h = 0; h < 24; h += 1) {
      if (hours[h] > envelopeByHour[h]) envelopeByHour[h] = hours[h];
    }
  }

  // Clear-sky index per day: mean of (actual / envelope) over hours where
  // both are positive. Missing hours are ignored, not treated as zero.
  const dailyIndices: number[] = [];
  const sortedDays = [...perDayHour.keys()].sort();
  for (const dayKey of sortedDays) {
    const hours = perDayHour.get(dayKey)!;
    let sum = 0;
    let count = 0;
    for (let h = 0; h < 24; h += 1) {
      if (hours[h] > 0 && envelopeByHour[h] > 0) {
        sum += Math.min(1.5, hours[h] / envelopeByHour[h]);
        count += 1;
      }
    }
    if (count > 0) dailyIndices.push(sum / count);
  }

  const latest3 = dailyIndices.slice(-3);
  const clearSkyIndex =
    latest3.length > 0
      ? latest3.reduce((s, v) => s + v, 0) / latest3.length
      : 1;

  return {
    envelopeByHour: envelopeByHour.map((v) => round3(v)),
    clearSkyIndex: Math.round(clearSkyIndex * 1000) / 1000,
    historyDays: perDayHour.size,
  };
}

// ── Consumption learning ──────────────────────────────────────────────────

/** Groups readings into 168 hour-of-week slots (Monday = 0). */
function groupByHourOfWeek(readings: ConsumptionReading[]): number[][] {
  const slots: number[][] = Array.from({ length: 168 }, () => []);
  for (const row of readings) {
    const d = new Date(row.timestamp);
    const dow = (d.getDay() + 6) % 7; // Monday = 0
    slots[dow * 24 + d.getHours()].push(row.energy_kwh);
  }
  return slots;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Learns hour-of-week medians plus weekly seasonality from readings.
 * `weeklyFactor` = mean of the last 7 local days ÷ mean of the full window,
 * so persistent load growth/shrinkage carries into the forecast.
 */
export function learnConsumptionPattern(
  readings: ConsumptionReading[]
): ConsumptionLearning {
  const slots = groupByHourOfWeek(readings);
  const medianByHourOfWeek = slots.map((values) =>
    values.length > 0 ? round3(median(values)) : 0
  );

  // Weekly factor: mean of last-7-days daily totals vs full-window mean.
  const perDay = new Map<string, number>();
  for (const row of readings) {
    const key = localDayKeyOf(new Date(row.timestamp));
    perDay.set(key, (perDay.get(key) ?? 0) + row.energy_kwh);
  }
  const dayTotals = [...perDay.values()];
  const windowMean =
    dayTotals.length > 0
      ? dayTotals.reduce((s, v) => s + v, 0) / dayTotals.length
      : 0;

  const recentKeys = [...perDay.keys()].sort().slice(-7);
  const recentMean =
    recentKeys.length > 0
      ? recentKeys.reduce((s, k) => s + (perDay.get(k) ?? 0), 0) /
        recentKeys.length
      : 0;

  const weeklyFactor =
    windowMean > 0 && recentMean > 0
      ? Math.min(1.5, Math.max(0.67, recentMean / windowMean))
      : 1;

  return {
    medianByHourOfWeek,
    weeklyFactor: Math.round(weeklyFactor * 1000) / 1000,
    historyDays: perDay.size,
  };
}

// ── Forecasting ───────────────────────────────────────────────────────────

const SOLAR_DAY_START = 6;
const SOLAR_DAY_END = 19; // exclusive: hours 6..18

/**
 * Projects hourly solar kWh for `horizonDays` local days starting `startDay`.
 * Each hour: envelope × clearSkyIndex (the envelope already carries seasonal
 * shape because it is learned from recent same-season days). Night hours
 * produce no forecast rows.
 */
export function forecastSolar(
  learning: SolarLearning,
  horizonDays: number,
  startDay: Date
): ForecastPoint[] {
  const points: ForecastPoint[] = [];
  for (let day = 0; day < horizonDays; day += 1) {
    const dayDate = addDays(startDay, day);
    for (let hour = SOLAR_DAY_START; hour < SOLAR_DAY_END; hour += 1) {
      const base = learning.envelopeByHour[hour] * learning.clearSkyIndex;
      if (base <= 0) continue;
      points.push({
        timestamp: isoOf(dayDate, hour),
        forecastType: "solar",
        predictedKwh: round3(base),
      });
    }
  }
  return points;
}

/**
 * Projects hourly consumption kWh for `horizonDays` local days starting
 * `startDay`. Picks the median for the target hour-of-week, scaled by the
 * weekly factor.
 */
export function forecastConsumption(
  learning: ConsumptionLearning,
  horizonDays: number,
  startDay: Date
): ForecastPoint[] {
  const points: ForecastPoint[] = [];
  for (let day = 0; day < horizonDays; day += 1) {
    const dayDate = addDays(startDay, day);
    const dow = (dayDate.getDay() + 6) % 7; // Monday = 0
    for (let hour = 0; hour < 24; hour += 1) {
      const value =
        learning.medianByHourOfWeek[dow * 24 + hour] * learning.weeklyFactor;
      if (value <= 0) continue;
      points.push({
        timestamp: isoOf(dayDate, hour),
        forecastType: "consumption",
        predictedKwh: round3(value),
      });
    }
  }
  return points;
}

// ── Shared local-date helpers (kept private — time.ts stays canonical) ─────

function localDayKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isoOf(dayDate: Date, hour: number): string {
  const d = new Date(dayDate);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
