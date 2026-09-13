/**
 * Battery + grid hourly integration (spec §46, §36).
 *
 * Given solar and consumption for one hour, decides the battery action using
 * simple tariff-aware rules and enforces all configured constraints. Produces
 * battery telemetry and the grid import/export for the hour.
 *
 * Rules (MVP heuristic — the Phase 9 optimizer will do better):
 *  1. Serve load from solar first.
 *  2. Surplus solar charges the battery, then exports the remainder.
 *  3. Deficit is covered by discharge during expensive hours, otherwise grid.
 *  4. SOC always stays within [min_soc, max_soc].
 */
import { clamp, round } from "./random";
import type { EnergySystem } from "@/types/energy";

export interface HourEnergyBalance {
  solarKwh: number;
  consumptionKwh: number;
}

export interface BatteryHourContext {
  system: Pick<
    EnergySystem,
    | "battery_capacity_kwh"
    | "battery_max_charge_kw"
    | "battery_max_discharge_kw"
    | "min_soc"
    | "max_soc"
    | "battery_charge_efficiency"
    | "battery_discharge_efficiency"
  >;
  /** Tariff rate in effect this hour (currency/kWh). */
  tariffRate: number;
  /** Average tariff across the day, used to classify "expensive" hours. */
  averageTariff: number;
  /** SOC (%) at the start of the hour. */
  soc: number;
}

export interface BatteryHourResult {
  /** SOC (%) at the end of the hour. */
  soc: number;
  chargePowerKw: number;
  dischargePowerKw: number;
  gridImportKw: number;
  gridExportKw: number;
  voltage: number;
  current: number;
  temperature: number;
  soh: number;
}

/**
 * Simulates one hour of battery + grid behavior.
 * `solarKwh` / `consumptionKwh` are hourly energies (1h intervals).
 */
export function simulateBatteryHour(
  balance: HourEnergyBalance,
  ctx: BatteryHourContext
): BatteryHourResult {
  const sys = ctx.system;
  const capacityKwh = sys.battery_capacity_kwh;

  const base = {
    chargePowerKw: 0,
    dischargePowerKw: 0,
    gridImportKw: 0,
    gridExportKw: 0,
  };

  // No battery configured → everything passes through the grid meter.
  if (capacityKwh <= 0) {
    return {
      ...base,
      soc: 0,
      gridImportKw: round(Math.max(0, balance.consumptionKwh - balance.solarKwh), 3),
      gridExportKw: round(Math.max(0, balance.solarKwh - balance.consumptionKwh), 3),
      voltage: 0,
      current: 0,
      temperature: 28,
      soh: 100,
    };
  }

  const net = balance.solarKwh - balance.consumptionKwh; // + surplus, - deficit
  let soc = clamp(ctx.soc, sys.min_soc, sys.max_soc);
  let chargePowerKw = 0;
  let dischargePowerKw = 0;
  let gridImportKw = 0;
  let gridExportKw = 0;

  const expensive = ctx.averageTariff > 0 && ctx.tariffRate > ctx.averageTariff;

  if (net > 0) {
    // Surplus solar: charge first, then export the remainder.
    const headroomKwh = ((sys.max_soc - soc) / 100) * capacityKwh;
    const chargeEnergyIn = Math.min(
      net,
      sys.battery_max_charge_kw,
      headroomKwh / sys.battery_charge_efficiency
    );
    chargePowerKw = round(chargeEnergyIn, 3);
    soc = clamp(
      soc + ((chargeEnergyIn * sys.battery_charge_efficiency) / capacityKwh) * 100,
      0,
      100
    );
    gridExportKw = round(net - chargeEnergyIn, 3);
  } else if (net < 0) {
    const deficit = -net;
    const availableKwh =
      ((soc - sys.min_soc) / 100) *
      capacityKwh *
      sys.battery_discharge_efficiency;
    // With a flat tariff, allow discharge for any deficit (baseline behavior).
    const shouldDischarge =
      ctx.averageTariff === 0 || expensive || deficit > capacityKwh * 0.25;

    if (shouldDischarge && availableKwh > 0.05) {
      const dischargeKwh = Math.min(
        deficit,
        sys.battery_max_discharge_kw,
        availableKwh
      );
      dischargePowerKw = round(dischargeKwh, 3);
      soc = clamp(
        soc -
          ((dischargeKwh / sys.battery_discharge_efficiency) / capacityKwh) * 100,
        0,
        100
      );
      gridImportKw = round(deficit - dischargeKwh, 3);
    } else {
      gridImportKw = round(deficit, 3);
    }
  }

  // Telemetry: nominal 48V pack; current sign follows power (+ = charging).
  const packVoltage = 48 + (soc / 100) * 4;
  const netPowerKw = chargePowerKw - dischargePowerKw;
  const current =
    packVoltage > 0 ? round((netPowerKw * 1000) / packVoltage, 3) : 0;
  const temperature = round(
    28 + Math.abs(netPowerKw) * 0.15 + (soc / 100) * 2,
    1
  );

  return {
    soc: round(soc, 2),
    chargePowerKw,
    dischargePowerKw,
    gridImportKw,
    gridExportKw,
    voltage: round(packVoltage, 2),
    current,
    temperature,
    soh: 100,
  };
}

/** Deterministic starting SOC for a simulated day (spreads days apart). */
export function computeStartSoc(
  seedDayFactor: number,
  minSoc: number,
  maxSoc: number
): number {
  return clamp(minSoc + seedDayFactor * (maxSoc - minSoc), minSoc, maxSoc);
}
