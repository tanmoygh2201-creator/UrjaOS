/**
 * Consumption simulation (spec §46).
 *
 * Three load profiles with realistic daily patterns:
 *  - residential: evening peak, mild morning bump, lower weekend daytime
 *  - commercial: business hours plateau (weekday only)
 *  - industrial: high sustained base load with heavy start around 09:00
 * Baseload, season, weekday/weekend, and per-hour noise modulate the shape.
 */
import { clamp, noise, round, type Rng } from "./random";
import type { SystemType } from "@/types/energy";

export interface ConsumptionModelConfig {
  systemType: SystemType;
  /** Average daily energy target in kWh (the model scales to hit this). */
  dailyKwhTarget: number;
  month: number;
  /** 0 = Monday … 6 = Sunday. */
  dayOfWeek: number;
  hour: number;
  rng: Rng;
}

/** Relative 24h load shapes (fraction of each day's peak). */
const PROFILE_SHAPES: Record<SystemType, number[]> = {
  // Morning bump, midday moderate, strong evening peak, overnight baseload.
  residential: [
    0.32, 0.28, 0.26, 0.24, 0.24, 0.3, 0.45, 0.55, 0.5, 0.45, 0.42, 0.45, 0.5,
    0.48, 0.45, 0.45, 0.5, 0.6, 0.85, 1.0, 0.9, 0.7, 0.5, 0.38,
  ],
  // Business-hours plateau, low nights, quiet weekends.
  commercial: [
    0.2, 0.18, 0.16, 0.16, 0.18, 0.3, 0.5, 0.7, 0.85, 0.9, 0.95, 0.95, 0.85,
    0.9, 0.95, 0.95, 0.9, 0.8, 0.6, 0.45, 0.35, 0.3, 0.25, 0.22,
  ],
  // Sustained base load, big morning start-up ramp, modest evening.
  industrial: [
    0.55, 0.52, 0.5, 0.5, 0.52, 0.6, 0.72, 0.85, 0.95, 1.0, 1.0, 0.98, 0.9,
    0.95, 0.98, 1.0, 0.98, 0.92, 0.8, 0.7, 0.65, 0.62, 0.6, 0.58,
  ],
};

/** Cooling (summer) and heating (winter) seasonal multipliers. */
const SEASONAL_BY_MONTH = [
  1.12, 1.1, 1.04, 0.98, 0.94, 0.96, 1.0, 1.0, 0.98, 1.0, 1.06, 1.14,
] as const;

/** Weekend multiplier (residential rises slightly, work sites drop). */
function weekendFactor(systemType: SystemType, dayOfWeek: number): number {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (!isWeekend) return 1;
  switch (systemType) {
    case "residential":
      return 1.1;
    case "commercial":
      return 0.45;
    case "industrial":
      return 0.6;
  }
}

/**
 * Expected load for one hour, in kW (average over the hour).
 *
 * The 24h shape is normalized to sum to the daily kWh target; each hour's
 * energy = share × target, and load_kw = energy (1h intervals).
 */
export function simulateConsumptionHour(
  config: ConsumptionModelConfig
): { loadKw: number; energyKwh: number } {
  const { systemType, dailyKwhTarget, month, dayOfWeek, hour, rng } = config;
  const shape = PROFILE_SHAPES[systemType];

  const seasonal = SEASONAL_BY_MONTH[clamp(month - 1, 0, 11)];
  const weekend = weekendFactor(systemType, dayOfWeek);

  // Energy share of the day for this hour, before noise.
  const raw = shape[hour] * seasonal * weekend;
  const total = shape.reduce((sum, v) => sum + v, 0);
  const normalizedShare = raw / total;
  let energyKwh = normalizedShare * dailyKwhTarget * (1 + noise(rng, 0.1));

  energyKwh = Math.max(0, round(energyKwh, 3));
  return { loadKw: energyKwh, energyKwh };
}
