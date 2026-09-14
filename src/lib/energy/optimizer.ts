/**
 * Rule-based battery optimization engine (spec §35–38).
 *
 * Produces an hourly charge/discharge schedule over a forecast horizon that
 * respects every battery constraint. V1 is DECISION-SUPPORT ONLY — the output
 * is a recommendation plan, never a device command.
 *
 * ── Strategy: charge-side lookahead ────────────────────────────────────────
 * Storage is bounded by FUTURE PEAK DEMAND. At every charging opportunity
 * (surplus solar, or the cheapest tariff window under a time-of-use tariff)
 * the engine charges at most what later peak hours can still discharge:
 *
 *   maxUsefulCharge = (pendingPeakDeficit − usableStoredNow) / roundTripEff
 *
 * so every kWh stored is guaranteed to be discharged at the horizon's peak
 * rate. Discharging is then always profitable: the refill cost per delivered
 * kWh (minRate / roundTripEff) stays below the peak rate as long as the
 * tariff spread clears the round-trip losses — enforced by requiring
 * maxRate ≥ 1.25 × minRate before arbitrage is enabled at all.
 *
 * Under a FLAT tariff there is no arbitrage: the cost model has no export
 * revenue, so the optimal plan IS the no-battery baseline (expected savings
 * of exactly 0) and the engine says so honestly.
 *
 * ── Constraints (mirrors the simulator + DB checks) ────────────────────────
 *  - SOC always within [min_soc, max_soc]
 *  - charge ≤ battery_max_charge_kw, discharge ≤ battery_max_discharge_kw
 *  - never charge and discharge in the same hour (DB CHECK constraint)
 *  - all powers ≥ 0; charging from surplus solar before grid charging
 */
import type { EnergySystem, OptimizationAction } from "@/types/energy";

export const ROUND_TRIP_MIN_SPREAD = 1.25;

export interface PlanHourInput {
  timestamp: string; // ISO, the hour this row applies to
  solarKwh: number;
  consumptionKwh: number;
  /** Tariff rate in effect for this hour (currency/kWh). */
  tariffRate: number;
}

export interface PlanHour {
  timestamp: string;
  action: OptimizationAction;
  chargePowerKw: number;
  dischargePowerKw: number;
  /** SOC (%) at the END of the hour. */
  soc: number;
  gridImportKwh: number;
  gridExportKwh: number;
  tariffRate: number;
  /** Grid cost for this hour under the plan. */
  expectedCost: number;
  /** Baseline (no-battery) grid cost for this hour minus expectedCost. */
  expectedSaving: number;
}

export interface PlanSummary {
  baselineCost: number;
  optimizedCost: number;
  expectedSaving: number;
  totalDischargeKwh: number;
  totalChargeKwh: number;
  /** Total discharge in equivalent full cycles (discharge ÷ capacity). */
  equivalentCycles: number;
  gridChargeKwh: number;
  arbitrageEnabled: boolean;
}

export interface OptimizationPlan {
  schedule: PlanHour[];
  summary: PlanSummary;
  startSoc: number;
}

type BatterySystem = Pick<
  EnergySystem,
  | "battery_capacity_kwh"
  | "battery_max_charge_kw"
  | "battery_max_discharge_kw"
  | "min_soc"
  | "max_soc"
  | "battery_charge_efficiency"
  | "battery_discharge_efficiency"
>;

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Plans the optimal hourly battery schedule over the given forecast hours
 * (chronological, no gaps). `startSoc` is the battery state at the start of
 * the first hour, in %.
 */
export function planOptimalSchedule(
  system: BatterySystem,
  hours: PlanHourInput[],
  startSoc: number
): OptimizationPlan {
  const capacity = system.battery_capacity_kwh;
  const chargeEff = clamp01(system.battery_charge_efficiency);
  const dischargeEff = clamp01(system.battery_discharge_efficiency);
  const roundTripEff = chargeEff * dischargeEff;

  // ── Baseline (no battery) — what the plan is compared against ───────────
  const baselineImport = hours.map((h) =>
    Math.max(0, h.consumptionKwh - h.solarKwh)
  );

  // No battery, no hours, or nothing to optimize → baseline plan.
  if (capacity <= 0 || hours.length === 0) {
    return baselinePlan(hours, baselineImport, capacity);
  }

  const rates = hours.map((h) => Math.max(0, h.tariffRate));
  const peakRate = Math.max(...rates);
  const minRate = Math.min(...rates);

  // Arbitrage needs a spread that clears round-trip losses with margin.
  const arbitrageEnabled =
    minRate > 0 && rates.some((r) => r >= minRate * ROUND_TRIP_MIN_SPREAD);

  if (!arbitrageEnabled) {
    return baselinePlan(hours, baselineImport, capacity);
  }

  const minSoc = system.min_soc;
  const maxSoc = system.max_soc;
  let soc = clamp(startSoc, minSoc, maxSoc);

  // Pending peak deficit: AC kWh still to be delivered by discharge at peak
  // hours ahead. Charging is bounded by this, bounding storage to demand.
  let pendingPeakDeficit = 0;
  for (let i = 0; i < hours.length; i += 1) {
    if (rates[i] >= peakRate - 1e-9) {
      pendingPeakDeficit += Math.min(
        Math.max(0, hours[i].consumptionKwh - hours[i].solarKwh),
        system.battery_max_discharge_kw
      );
    }
  }

  const schedule: PlanHour[] = [];

  for (let i = 0; i < hours.length; i += 1) {
    const hour = hours[i];
    const rate = rates[i];
    const isPeak = rate >= peakRate - 1e-9;
    const isCheapest = rate <= minRate + 1e-9;

    const net = hour.solarKwh - hour.consumptionKwh; // + surplus / − deficit
    let chargePowerKw = 0;
    let dischargePowerKw = 0;
    let gridImportKwh = 0;
    let gridExportKwh = 0;

    // AC energy the battery can still deliver above min_soc.
    const usableStored =
      ((soc - minSoc) / 100) * capacity * dischargeEff;

    if (net > 0) {
      // ── Surplus solar: charge only what future peaks can use ─────────────
      const headroomAc = ((maxSoc - soc) / 100) * capacity / chargeEff;
      const usefulAc = Math.max(0, pendingPeakDeficit - usableStored) / roundTripEff;
      const chargeFromSolar = Math.min(net, system.battery_max_charge_kw, headroomAc, usefulAc);
      chargePowerKw = round3(Math.max(0, chargeFromSolar));
      gridExportKwh = round3(net - chargePowerKw);
      soc = applyCharge(soc, chargePowerKw, chargeEff, capacity, minSoc, maxSoc);
    } else if (net < 0) {
      const deficit = -net;
      if (isPeak && usableStored > 0.05) {
        // ── Peak hour: discharge what was stored for exactly this ──────────
        dischargePowerKw = round3(
          Math.min(deficit, system.battery_max_discharge_kw, usableStored)
        );
        pendingPeakDeficit = Math.max(0, pendingPeakDeficit - dischargePowerKw);
        soc = applyDischarge(
          soc,
          dischargePowerKw,
          dischargeEff,
          capacity,
          minSoc,
          maxSoc
        );
        gridImportKwh = round3(Math.max(0, deficit - dischargePowerKw));
      } else {
        gridImportKwh = round3(deficit);
      }
    }

    // ── Cheap-window grid charging: prepare for later peaks ────────────────
    // Only in the cheapest hours, only what later peaks will discharge, and
    // never alongside solar charging or discharge in the same hour. The
    // hour's own load import is irrelevant — charging on top of it is normal
    // (the cost lands in gridImportKwh either way).
    if (isCheapest && chargePowerKw === 0 && dischargePowerKw === 0) {
      const usableNow = ((soc - minSoc) / 100) * capacity * dischargeEff;
      const neededAc = Math.max(0, pendingPeakDeficit - usableNow) / roundTripEff;
      const headroomAc = ((maxSoc - soc) / 100) * capacity / chargeEff;
      const gridCharge = Math.min(
        system.battery_max_charge_kw,
        headroomAc,
        neededAc
      );
      if (gridCharge > 0.05) {
        chargePowerKw = round3(gridCharge);
        // Charging rides on top of the hour's own load import.
        gridImportKwh = round3(gridImportKwh + gridCharge);
        soc = applyCharge(soc, chargePowerKw, chargeEff, capacity, minSoc, maxSoc);
      }
    }

    const expectedCost = round2(gridImportKwh * rate);
    const expectedSaving = round2(
      (baselineImport[i] - gridImportKwh) * rate
    );

    schedule.push({
      timestamp: hour.timestamp,
      action: classifyAction(
        chargePowerKw,
        dischargePowerKw,
        gridImportKwh,
        hour.solarKwh,
        hour.consumptionKwh
      ),
      chargePowerKw,
      dischargePowerKw,
      soc: round2(soc),
      gridImportKwh,
      gridExportKwh,
      tariffRate: rate,
      expectedCost,
      expectedSaving,
    });
  }

  return {
    schedule,
    summary: summarize(schedule, baselineImport, rates, capacity, true),
    startSoc: round2(clamp(startSoc, minSoc, maxSoc)),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value <= 1 ? value : 1, 0.05, 1);
}

/** SOC gain from charging `acKwh` (AC-side energy in), clamped to bounds. */
function applyCharge(
  soc: number,
  acKwh: number,
  chargeEff: number,
  capacity: number,
  minSoc: number,
  maxSoc: number
): number {
  return clamp(
    soc + ((acKwh * chargeEff) / capacity) * 100,
    minSoc,
    maxSoc
  );
}

/** SOC draw from discharging `acKwh` (AC-side energy out), clamped to bounds. */
function applyDischarge(
  soc: number,
  acKwh: number,
  dischargeEff: number,
  capacity: number,
  minSoc: number,
  maxSoc: number
): number {
  return clamp(
    soc - ((acKwh / dischargeEff) / capacity) * 100,
    minSoc,
    maxSoc
  );
}

/** Maps hour movements to the DB-checked action enum. */
function classifyAction(
  chargeKw: number,
  dischargeKw: number,
  gridImportKwh: number,
  solarKwh: number,
  consumptionKwh: number
): OptimizationAction {
  if (dischargeKw > 0) return "discharge";
  if (chargeKw > 0) return gridImportKwh > 0 ? "grid" : "charge";
  if (solarKwh > 0 && consumptionKwh > 0 && gridImportKwh === 0) {
    return "solar_to_load";
  }
  return "idle";
}

/** The no-battery plan: identical to baseline, savings exactly 0. */
function baselinePlan(
  hours: PlanHourInput[],
  baselineImport: number[],
  capacity: number
): OptimizationPlan {
  const rates = hours.map((h) => Math.max(0, h.tariffRate));
  const schedule: PlanHour[] = hours.map((hour, i) => {
    const net = hour.solarKwh - hour.consumptionKwh;
    return {
      timestamp: hour.timestamp,
      action: classifyAction(0, 0, baselineImport[i], hour.solarKwh, hour.consumptionKwh),
      chargePowerKw: 0,
      dischargePowerKw: 0,
      soc: 0,
      gridImportKwh: round3(Math.max(0, -net)),
      gridExportKwh: round3(Math.max(0, net)),
      tariffRate: rates[i],
      expectedCost: round2(Math.max(0, -net) * rates[i]),
      expectedSaving: 0,
    };
  });
  return {
    schedule,
    summary: summarize(schedule, baselineImport, rates, capacity, false),
    startSoc: 0,
  };
}

function summarize(
  schedule: PlanHour[],
  baselineImport: number[],
  rates: number[],
  capacity: number,
  arbitrageEnabled: boolean
): PlanSummary {
  let baselineCost = 0;
  let optimizedCost = 0;
  let totalDischargeKwh = 0;
  let totalChargeKwh = 0;
  let gridChargeKwh = 0;

  for (let i = 0; i < schedule.length; i += 1) {
    baselineCost += baselineImport[i] * rates[i];
    optimizedCost += schedule[i].expectedCost;
    totalDischargeKwh += schedule[i].dischargePowerKw;
    totalChargeKwh += schedule[i].chargePowerKw;
    if (schedule[i].action === "grid") gridChargeKwh += schedule[i].chargePowerKw;
  }

  return {
    baselineCost: round2(baselineCost),
    optimizedCost: round2(optimizedCost),
    expectedSaving: round2(baselineCost - optimizedCost),
    totalDischargeKwh: round3(totalDischargeKwh),
    totalChargeKwh: round3(totalChargeKwh),
    equivalentCycles:
      capacity > 0 ? round2(totalDischargeKwh / capacity) : 0,
    gridChargeKwh: round3(gridChargeKwh),
    arbitrageEnabled,
  };
}
