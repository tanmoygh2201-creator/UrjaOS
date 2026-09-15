/**
 * UrjaOS alert engine (Phase 3 migrations, alerts table — V1 in-app alerts).
 *
 * Pure functions: rules consume pre-aggregated daily statistics and return
 * candidate alerts (or null). No I/O — determinism makes every threshold
 * testable, and the service layer decides persistence and deduplication.
 */

import { formatKwh, formatPercent } from "@/lib/energy/format";

/** Per-day aggregates the rules operate on (local-day bucketed). */
export interface DailyStats {
  /** Local day key, e.g. "2026-09-14". */
  dayKey: string;
  solarKwh: number;
  consumptionKwh: number;
  gridImportKwh: number;
  gridExportKwh: number;
  /** Max battery charge power seen this day (kW). */
  maxChargeKw: number;
  /** Max battery discharge power seen this day (kW). */
  maxDischargeKw: number;
  /** Last state-of-charge reading of the day (%). */
  endSoc: number | null;
  hasReadings: boolean;
}

/** A rule evaluation outcome: a candidate alert, or nothing. */
export interface CandidateAlert {
  type: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  message: string;
  /** Machine-readable dedup key: same key + system ⇒ don't re-raise. */
  dedupKey: string;
}

/** Rule thresholds (V1 defaults; constants keep behavior reviewable). */
export const ALERT_THRESHOLDS = {
  /** Exported ≥ this fraction of generation ⇒ curtailment/wastage alert. */
  wastageExportFraction: 0.25,
  /** Grid import rose ≥ this fraction vs the trailing baseline. */
  importSpikeFraction: 1.5,
  /** Minimum baseline import (kWh) below which spikes are not meaningful. */
  importSpikeFloorKwh: 5,
  /** Battery end-of-day SOC below this ⇒ low-charge alert. */
  lowSocPct: 20,
  /** Consecutive no-reading days before raising a communication alert. */
  staleDays: 2,
  /** How many trailing baseline days the spike rule compares against. */
  baselineDays: 7,
} as const;

/**
 * Solar wastage: most generated energy was exported instead of used — usually
 * a sizing or curtailment problem worth investigating.
 */
export function checkSolarWastage(day: DailyStats): CandidateAlert | null {
  if (!day.hasReadings || day.solarKwh < 10) return null;
  const exportFraction = day.gridExportKwh / day.solarKwh;
  if (exportFraction < ALERT_THRESHOLDS.wastageExportFraction) return null;
  return {
    type: "solar_wastage",
    severity: exportFraction >= 0.5 ? "high" : "medium",
    message: `${formatPercent(exportFraction * 100)} of ${formatKwh(
      day.solarKwh
    )} generated on ${day.dayKey} was exported to the grid instead of being used or stored. Consider shifting loads to solar hours or reviewing battery charge windows.`,
    dedupKey: `solar_wastage:${day.dayKey}`,
  };
}

/** Low battery: the system ended the day nearly empty. */
export function checkLowBattery(day: DailyStats): CandidateAlert | null {
  if (!day.hasReadings || day.endSoc === null) return null;
  if (day.endSoc >= ALERT_THRESHOLDS.lowSocPct) return null;
  return {
    type: "low_battery",
    severity: day.endSoc < 10 ? "high" : "medium",
    message: `Battery ended ${day.dayKey} at ${formatPercent(
      day.endSoc
    )} state of charge — below the ${ALERT_THRESHOLDS.lowSocPct}% comfort threshold. Night loads will draw from the grid.`,
    dedupKey: `low_battery:${day.dayKey}`,
  };
}

/** Communication gap: no readings at all for the day (after it has passed). */
export function checkCommunicationGap(
  day: DailyStats,
  /** Days at the end of the window with no data at all (consecutive). */
  trailingEmptyDays: number
): CandidateAlert | null {
  if (day.hasReadings) return null;
  if (trailingEmptyDays < ALERT_THRESHOLDS.staleDays) return null;
  return {
    type: "communication_gap",
    severity: trailingEmptyDays >= ALERT_THRESHOLDS.staleDays + 2 ? "high" : "low",
    message: `No readings received for ${trailingEmptyDays} consecutive days (last checked ${day.dayKey}). The inverter or meter connection may be down.`,
    dedupKey: "communication_gap",
  };
}

/**
 * Grid import spike: imports rose well above the trailing baseline — a load
 * change, solar underperformance, or battery misbehavior.
 */
export function checkImportSpike(
  day: DailyStats,
  baselineDays: DailyStats[]
): CandidateAlert | null {
  if (!day.hasReadings) return null;
  const usable = baselineDays.filter((d) => d.hasReadings);
  if (usable.length === 0) return null;
  const baseline =
    usable.reduce((sum, d) => sum + d.gridImportKwh, 0) / usable.length;
  if (baseline < ALERT_THRESHOLDS.importSpikeFloorKwh) return null;
  const ratio = day.gridImportKwh / baseline;
  if (ratio < ALERT_THRESHOLDS.importSpikeFraction) return null;
  return {
    type: "import_spike",
    severity: ratio >= 2 ? "critical" : "high",
    message: `Grid import on ${day.dayKey} was ${formatKwh(
      day.gridImportKwh
    )} — ${Math.round(ratio * 100)}% of the ${usable.length}-day average (${formatKwh(
      baseline
    )}). Check for new loads, solar underperformance, or a battery that stopped discharging.`,
    dedupKey: `import_spike:${day.dayKey}`,
  };
}

/** Bill-vs-actual analysis result shared by the analyzer and its alert. */
export interface BillVerdict {
  status: "under" | "within" | "over";
  /** Actual estimated grid cost from readings, in currency units. */
  estimatedCost: number;
  /** Difference bill − estimate (positive = billed more than estimated). */
  difference: number;
  /** difference / estimate, as a fraction. */
  differenceFraction: number;
}

/** Classifies a utility bill against the estimated cost from readings. */
export function classifyBill(
  billTotal: number,
  estimatedCost: number
): BillVerdict {
  const difference = billTotal - estimatedCost;
  const differenceFraction =
    estimatedCost > 0 ? difference / estimatedCost : difference > 0 ? 1 : 0;
  const status: BillVerdict["status"] =
    differenceFraction > 0.1 ? "over" : differenceFraction < -0.1 ? "under" : "within";
  return { status, estimatedCost, difference, differenceFraction };
}

/** Human message for a bill verdict (used by the analyzer UI and alerts). */
export function billVerdictMessage(verdict: BillVerdict, currencySymbol: string, period: string): string {
  switch (verdict.status) {
    case "over":
      return `${currencySymbol}${verdict.difference.toFixed(2)} more than the ${currencySymbol}${verdict.estimatedCost.toFixed(
        2
      )} estimated from readings for ${period} — worth comparing the meter dates and tariff on the bill.`;
    case "under":
      return `${currencySymbol}${Math.abs(verdict.difference).toFixed(
        2
      )} less than the estimated cost for ${period} — check whether the bill covers a partial period.`;
    case "within":
      return `Bill matches the estimated cost for ${period} (within 10%).`;
  }
}
