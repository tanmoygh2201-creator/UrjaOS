/**
 * UrjaOS domain types — mirror of the database schema (supabase/migrations).
 *
 * Rows come back from supabase-js with ISO-8601 timestamp strings and numbers
 * for numeric columns; they are validated at the boundary (Zod) before use.
 */

// ── Enums (match CHECK constraints) ─────────────────────────────────────────

export type SystemType = "residential" | "commercial" | "industrial";
export type UserRole = "user" | "admin" | "energy_manager";
export type ForecastType = "solar" | "consumption";
export type OptimizationAction =
  | "charge"
  | "discharge"
  | "idle"
  | "grid"
  | "solar_to_load";
export type AlertSeverity = "info" | "low" | "medium" | "high" | "critical";

// ── Tariffs ─────────────────────────────────────────────────────────────────

export interface TariffPeriod {
  /** Display name, e.g. "peak". */
  name: string;
  /** Start hour of day, 0-23 inclusive. */
  startHour: number;
  /** End hour of day, exclusive (wraps past 24 for overnight windows). */
  endHour: number;
  /** Rate in currency units per kWh. */
  rate: number;
}

export type TariffConfig =
  | { type: "flat"; currency: string; rate: number }
  | { type: "tou"; currency: string; periods: TariffPeriod[] };

export type CurrencyCode = string; // ISO-4217, e.g. "INR"

// ── Rows ────────────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface EnergySystem {
  id: string;
  user_id: string;
  name: string;
  location: string | null;
  system_type: SystemType;
  solar_capacity_kw: number;
  battery_capacity_kwh: number;
  battery_max_charge_kw: number;
  battery_max_discharge_kw: number;
  min_soc: number;
  max_soc: number;
  battery_charge_efficiency: number;
  battery_discharge_efficiency: number;
  electricity_tariff: TariffConfig;
  currency: CurrencyCode;
  created_at: string;
  updated_at: string;
}

export interface SolarReading {
  id: string;
  system_id: string;
  timestamp: string;
  generation_kw: number;
  energy_kwh: number;
  irradiance: number | null;
  temperature: number | null;
  created_at: string;
}

export interface ConsumptionReading {
  id: string;
  system_id: string;
  timestamp: string;
  load_kw: number;
  energy_kwh: number;
  created_at: string;
}

export interface BatteryReading {
  id: string;
  system_id: string;
  timestamp: string;
  soc: number;
  soh: number;
  voltage: number | null;
  /** Amperes; negative values indicate discharge. */
  current: number | null;
  temperature: number | null;
  charge_power: number;
  discharge_power: number;
  created_at: string;
}

export interface GridReading {
  id: string;
  system_id: string;
  timestamp: string;
  import_kw: number;
  export_kw: number;
  /** Tariff in effect at reading time (currency per kWh). */
  tariff: number | null;
  created_at: string;
}

export interface Forecast {
  id: string;
  system_id: string;
  forecast_type: ForecastType;
  timestamp: string;
  predicted_value: number;
  /** Filled in once the predicted hour has passed — enables accuracy metrics. */
  actual_value: number | null;
  model_version: string;
  created_at: string;
}

export interface OptimizationSchedule {
  id: string;
  system_id: string;
  timestamp: string;
  action: OptimizationAction;
  charge_power: number;
  discharge_power: number;
  /** Simulated cost for this hour under the recommended action. */
  expected_cost: number | null;
  /** Simulated saving vs. the unoptimized baseline. */
  expected_saving: number | null;
  created_at: string;
}

export interface Alert {
  id: string;
  system_id: string;
  type: string;
  severity: AlertSeverity;
  message: string;
  is_resolved: boolean;
  created_at: string;
  resolved_at: string | null;
}

export interface Bill {
  id: string;
  user_id: string;
  system_id: string | null;
  /** Billing month as "YYYY-MM". */
  billing_period: string;
  energy_consumed: number;
  energy_charge: number;
  fixed_charge: number;
  other_charges: number;
  total_amount: number;
  created_at: string;
}

// ── Insert helpers (rows the application creates) ───────────────────────────

/** A reading row as produced by the simulator / ingest pipeline. */
export interface ReadingInsert {
  system_id: string;
  timestamp: string;
  [key: string]: number | string | null;
}

export type EnergySystemInsert = Omit<
  EnergySystem,
  "id" | "created_at" | "updated_at"
>;

export type EnergySystemUpdate = Partial<
  Omit<EnergySystem, "id" | "user_id" | "created_at" | "updated_at">
>;
