/**
 * Solar generation simulation (spec §46).
 *
 * Produces realistic generation curves: zero at night, a broad bell during
 * daylight, modulated by seasonal sun altitude, cloud cover, panel
 * temperature derating, and per-hour noise. Deterministic per (seed, date).
 */
import { clamp, noise, round, uniform, type Rng } from "./random";

export interface SolarModelConfig {
  /** Installed PV capacity in kW (STC). */
  capacityKw: number;
  /** 0 = clear sky, 1 = fully overcast. */
  cloudiness: number;
  /** Month (1-12) — drives seasonal sun-altitude factor. */
  month: number;
  /** 0-23. */
  hour: number;
  rng: Rng;
}

/** Seasonal daylight/sun-strength factor by month (northern hemisphere). */
const SEASONAL_FACTOR = [
  0.75, 0.8, 0.9, 1.0, 1.1, 1.15, 1.15, 1.1, 1.0, 0.9, 0.8, 0.72,
] as const;

/** Panel temperature derating: output drops as cell temperature rises. */
function temperatureDerate(ambientTempC: number): number {
  // Roughly: -0.4%/°C above 25°C cell temp, cell ≈ ambient + 20°C at noon sun.
  const cellTemp = ambientTempC + 20;
  return clamp(1 - (cellTemp - 25) * 0.004, 0.8, 1.05);
}

/** Ambient temperature by hour and season (°C), for the derate + telemetry. */
export function simulateAmbientTemperature(month: number, hour: number): number {
  const seasonalMean = 28 - Math.cos(((month - 1) / 12) * 2 * Math.PI) * 8; // ~20-36°C India-ish
  const diurnal = Math.sin(Math.max(0, (hour - 6)) * (Math.PI / 14)) * 6;
  return round(seasonalMean + diurnal - (hour < 6 || hour > 19 ? 2 : 0), 1);
}

/**
 * Expected generation for one hour, in kW (average over the hour).
 * Returns 0 outside daylight hours.
 */
export function simulateSolarHour(config: SolarModelConfig): {
  generationKw: number;
  irradiance: number;
  temperature: number;
} {
  const { capacityKw, cloudiness, month, hour, rng } = config;

  if (capacityKw <= 0) {
    const temp = simulateAmbientTemperature(month, hour);
    return { generationKw: 0, irradiance: 0, temperature: temp };
  }

  // Sun altitude curve: rises ~6am, peaks ~13:00, sets ~18-19h.
  const solarNoon = 13;
  const halfDayWidth = 6.5;
  const x = (hour - solarNoon) / halfDayWidth;
  const altitude = x < -1 || x > 1 ? 0 : Math.cos((x * Math.PI) / 2); // 0..1

  const seasonal = SEASONAL_FACTOR[clamp(month - 1, 0, 11)];
  const cloudFactor = clamp(1 - cloudiness * uniform(rng, 0.55, 0.95), 0, 1);
  const temp = simulateAmbientTemperature(month, hour);
  const derate = temperatureDerate(temp);
  const jitter = 1 + noise(rng, 0.06); // ±6% electrical noise

  const generationKw = round(
    capacityKw * altitude * seasonal * cloudFactor * derate * jitter,
    3
  );

  // Clear-sky irradiance peaks ~1000 W/m²; scaled by altitude & clouds.
  const irradiance = round(1000 * altitude * cloudFactor, 2);
  const temperature = temp;

  return { generationKw: Math.max(0, generationKw), irradiance, temperature };
}
