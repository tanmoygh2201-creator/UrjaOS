/**
 * Simulation orchestrator (spec §47).
 *
 * For each day in a range, generates hourly solar, consumption, battery, and
 * grid rows using the deterministic models, wired through the tariff config.
 * Output row sets are shaped exactly like the database tables, ready to upsert.
 */
import { createRng, round } from "./random";
import { simulateSolarHour } from "./solar";
import { simulateConsumptionHour } from "./consumption";
import { computeStartSoc, simulateBatteryHour } from "./battery";
import { getTariffRateForHour, type TariffConfigInput } from "@/lib/validation/tariff";
import type { EnergySystem, SystemType } from "@/types/energy";

export interface SimulationOptions {
  system: Pick<
    EnergySystem,
    | "id"
    | "system_type"
    | "solar_capacity_kw"
    | "battery_capacity_kwh"
    | "battery_max_charge_kw"
    | "battery_max_discharge_kw"
    | "min_soc"
    | "max_soc"
    | "battery_charge_efficiency"
    | "battery_discharge_efficiency"
    | "electricity_tariff"
  >;
  /** Average daily consumption target in kWh. */
  dailyKwhTarget: number;
  /** Inclusive start date (local day). */
  startDate: Date;
  /** Inclusive end date (local day). */
  endDate: Date;
  /** Seed for deterministic output. Same seed → same data. */
  seed: number;
  /** 0 = clear sky … 1 = fully overcast. */
  cloudiness?: number;
}

export type SolarRow = {
  system_id: string;
  timestamp: string;
  generation_kw: number;
  energy_kwh: number;
  irradiance: number;
  temperature: number;
};

export type ConsumptionRow = {
  system_id: string;
  timestamp: string;
  load_kw: number;
  energy_kwh: number;
};

export type BatteryRow = {
  system_id: string;
  timestamp: string;
  soc: number;
  soh: number;
  voltage: number;
  current: number;
  temperature: number;
  charge_power: number;
  discharge_power: number;
};

export type GridRow = {
  system_id: string;
  timestamp: string;
  import_kw: number;
  export_kw: number;
  tariff: number;
};

export interface SimulationResult {
  solarRows: SolarRow[];
  consumptionRows: ConsumptionRow[];
  batteryRows: BatteryRow[];
  gridRows: GridRow[];
}

function tariffFromSystem(tariff: EnergySystem["electricity_tariff"]): TariffConfigInput {
  return tariff; // shapes are identical (TariffConfig ⊂ TariffConfigInput)
}

/** Tariff rate for a day-part; returns 0 for flat tariffs beyond the rate. */
function hourRates(tariff: TariffConfigInput): number[] {
  return Array.from({ length: 24 }, (_, h) => getTariffRateForHour(tariff, h));
}

function isoTimestamp(date: Date, hour: number): string {
  const d = new Date(date);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

/**
 * Runs the simulation for every hour of every day in the range.
 * Deterministic: same options → identical output.
 */
export function simulate(options: SimulationOptions): SimulationResult {
  const {
    system,
    dailyKwhTarget,
    startDate,
    endDate,
    seed,
    cloudiness = 0.25,
  } = options;

  const tariff = tariffFromSystem(system.electricity_tariff);
  const rates = hourRates(tariff);
  const averageTariff =
    rates.reduce((sum, r) => sum + r, 0) / rates.length || 0;

  const result: SimulationResult = {
    solarRows: [],
    consumptionRows: [],
    batteryRows: [],
    gridRows: [],
  };

  const socBounds = { min: system.min_soc, max: system.max_soc };

  const day = new Date(startDate);
  day.setHours(0, 0, 0, 0);
  const last = new Date(endDate);
  last.setHours(0, 0, 0, 0);

  while (day <= last) {
    const month = day.getMonth() + 1;
    const dayOfWeek = day.getDay();
    const daySeed = seed ^ (day.getFullYear() * 10000 + (day.getMonth() + 1) * 100 + day.getDate());
    const rng = createRng(daySeed);
    const dailyCloud = clamp01(cloudiness + rng() * 0.2 - 0.1);

    let soc = computeStartSoc(rng(), socBounds.min, socBounds.max);

    for (let hour = 0; hour < 24; hour += 1) {
      const timestamp = isoTimestamp(day, hour);

      const solar = simulateSolarHour({
        capacityKw: system.solar_capacity_kw,
        cloudiness: dailyCloud,
        month,
        hour,
        rng,
      });
      const solarEnergy = solar.generationKw; // 1h interval → kWh == kW avg

      const consumption = simulateConsumptionHour({
        systemType: system.system_type as SystemType,
        dailyKwhTarget,
        month,
        dayOfWeek,
        hour,
        rng,
      });

      const battery = simulateBatteryHour(
        { solarKwh: solarEnergy, consumptionKwh: consumption.energyKwh },
        {
          system,
          tariffRate: rates[hour],
          averageTariff,
          soc,
        }
      );
      soc = battery.soc;

      result.solarRows.push({
        system_id: system.id,
        timestamp,
        generation_kw: solar.generationKw,
        energy_kwh: solarEnergy,
        irradiance: solar.irradiance,
        temperature: solar.temperature,
      });
      result.consumptionRows.push({
        system_id: system.id,
        timestamp,
        load_kw: consumption.loadKw,
        energy_kwh: consumption.energyKwh,
      });
      result.batteryRows.push({
        system_id: system.id,
        timestamp,
        soc: battery.soc,
        soh: battery.soh,
        voltage: battery.voltage,
        current: battery.current,
        temperature: battery.temperature,
        charge_power: battery.chargePowerKw,
        discharge_power: battery.dischargePowerKw,
      });
      result.gridRows.push({
        system_id: system.id,
        timestamp,
        import_kw: battery.gridImportKw,
        export_kw: battery.gridExportKw,
        tariff: round(rates[hour], 4),
      });
    }

    day.setDate(day.getDate() + 1);
  }

  return result;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
