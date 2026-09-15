/**
 * Alert service (Phase 11).
 *
 * Loads local-day aggregates for a system, runs the pure alert engine over
 * them, deduplicates against existing alerts (same system + dedupKey), and
 * persists only new alerts. Page assembly loads alerts + bills + the
 * bill-analyzer comparison.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALERT_THRESHOLDS,
  checkCommunicationGap,
  checkImportSpike,
  checkLowBattery,
  checkSolarWastage,
  type CandidateAlert,
  type DailyStats,
} from "@/lib/energy/alert-engine";
import { fetchAllPages } from "@/lib/energy/paged-fetch";
import { localDayKey, addDays, startOfLocalDay } from "@/lib/energy/time";
import type { Alert, EnergySystem } from "@/types/energy";

/** How far back the daily check looks (mirrors the demo's 30-day window). */
const LOOKBACK_DAYS = 30;

/** Groups timestamped rows into per-day totals (viewer's local days). */
function bucketByLocalDay<T extends { timestamp: string }>(
  rows: T[]
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = localDayKey(row.timestamp);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}

/** Builds the per-day statistics the alert rules operate on. */
export function buildDailyStats(
  solar: { timestamp: string; energy_kwh: number }[],
  consumption: { timestamp: string; energy_kwh: number }[],
  grid: { timestamp: string; import_kw: number; export_kw: number }[],
  battery: { timestamp: string; soc: number; charge_power: number; discharge_power: number }[],
  days: string[]
): DailyStats[] {
  const solarByDay = bucketByLocalDay(solar);
  const consumptionByDay = bucketByLocalDay(consumption);
  const gridByDay = bucketByLocalDay(grid);
  const batteryByDay = bucketByLocalDay(battery);

  return days.map((dayKey) => {
    const solarRows = solarByDay.get(dayKey) ?? [];
    const consumptionRows = consumptionByDay.get(dayKey) ?? [];
    const gridRows = gridByDay.get(dayKey) ?? [];
    const batteryRows = batteryByDay.get(dayKey) ?? [];
    const lastBattery = batteryRows.length > 0 ? batteryRows[batteryRows.length - 1] : null;
    return {
      dayKey,
      solarKwh: solarRows.reduce((s, r) => s + r.energy_kwh, 0),
      consumptionKwh: consumptionRows.reduce((s, r) => s + r.energy_kwh, 0),
      gridImportKwh: gridRows.reduce((s, r) => s + r.import_kw, 0),
      gridExportKwh: gridRows.reduce((s, r) => s + r.export_kw, 0),
      maxChargeKw: batteryRows.reduce((m, r) => Math.max(m, r.charge_power), 0),
      maxDischargeKw: batteryRows.reduce((m, r) => Math.max(m, r.discharge_power), 0),
      endSoc: lastBattery ? lastBattery.soc : null,
      hasReadings:
        solarRows.length > 0 ||
        consumptionRows.length > 0 ||
        gridRows.length > 0 ||
        batteryRows.length > 0,
    };
  });
}

/** Evaluates every rule over the daily stats, in day order. */
export function evaluateRules(stats: DailyStats[]): CandidateAlert[] {
  const candidates: CandidateAlert[] = [];
  for (let i = 0; i < stats.length; i++) {
    const day = stats[i];
    const baseline = stats.slice(
      Math.max(0, i - ALERT_THRESHOLDS.baselineDays),
      i
    );
    // Only flag communication gaps when the empty day is in the trailing run.
    const trailingEmpty = stats
      .slice(i)
      .findIndex((d) => d.hasReadings);
    const emptyRun = trailingEmpty === -1 ? stats.length - i : trailingEmpty;
    for (const candidate of [
      checkSolarWastage(day),
      checkLowBattery(day),
      checkImportSpike(day, baseline),
      checkCommunicationGap(day, emptyRun),
    ]) {
      if (candidate) candidates.push(candidate);
    }
  }
  return candidates;
}

export interface RunCheckResult {
  ok: boolean;
  error?: string;
  /** Alerts inserted (after dedup). */
  created: number;
  /** Candidate alerts skipped because they already exist unresolved. */
  skipped: number;
  daysChecked: number;
}

/** Runs the daily alert check and persists new alerts. */
export async function runAlertCheck(
  supabase: SupabaseClient,
  system: EnergySystem,
  today: Date = new Date()
): Promise<RunCheckResult> {
  // The window ends yesterday: today is still incomplete, so its stats would
  // be misleading (low SOC, import spikes, and gaps are all day-total rules).
  const endDay = addDays(startOfLocalDay(today), -1);
  const startDay = addDays(endDay, -(LOOKBACK_DAYS - 1));

  const dayKeys: string[] = [];
  for (let d = new Date(startDay); d <= endDay; d.setDate(d.getDate() + 1)) {
    dayKeys.push(localDayKey(d));
  }

  const fromIso = startOfLocalDay(startDay).toISOString();
  const toIso = startOfLocalDay(addDays(endDay, 1)).toISOString();

  const [solar, consumption, grid, battery] = await Promise.all([
    fetchAllPages<{ timestamp: string; energy_kwh: number }>(
      supabase,
      "solar_readings",
      "timestamp, energy_kwh",
      system.id,
      fromIso,
      toIso
    ),
    fetchAllPages<{ timestamp: string; energy_kwh: number }>(
      supabase,
      "consumption_readings",
      "timestamp, energy_kwh",
      system.id,
      fromIso,
      toIso
    ),
    fetchAllPages<{ timestamp: string; import_kw: number; export_kw: number }>(
      supabase,
      "grid_readings",
      "timestamp, import_kw, export_kw",
      system.id,
      fromIso,
      toIso
    ),
    fetchAllPages<{
      timestamp: string;
      soc: number;
      charge_power: number;
      discharge_power: number;
    }>(
      supabase,
      "battery_readings",
      "timestamp, soc, charge_power, discharge_power",
      system.id,
      fromIso,
      toIso
    ),
  ]);

  const stats = buildDailyStats(solar, consumption, grid, battery, dayKeys);
  const candidates = evaluateRules(stats);

  // Dedup: skip candidates whose dedupKey already exists as an unresolved
  // alert (or was raised at all — a wastage day that was resolved shouldn't
  // re-fire, so match on system + type + day regardless of resolution).
  const { data: existing } = await supabase
    .from("alerts")
    .select("type, message, created_at")
    .eq("system_id", system.id)
    .order("created_at", { ascending: false })
    .limit(500);
  const existingKeys = new Set(
    (existing ?? []).map((a: { type: string; message: string }) => {
      // Day-scoped rules embed the day key in the message; the persistent
      // communication_gap rule has no day. Match on type + message.
      return `${a.type}:${a.message}`;
    })
  );

  const toInsert = candidates.filter(
    (c) => !existingKeys.has(`${c.type}:${c.message}`)
  );
  const skipped = candidates.length - toInsert.length;

  if (toInsert.length > 0) {
    const { error } = await supabase.from("alerts").insert(
      toInsert.map((c) => ({
        system_id: system.id,
        type: c.type,
        severity: c.severity,
        message: c.message,
      }))
    );
    if (error) {
      return { ok: false, error: error.message, created: 0, skipped, daysChecked: dayKeys.length };
    }
  }

  return { ok: true, created: toInsert.length, skipped, daysChecked: dayKeys.length };
}

// ── Page data ───────────────────────────────────────────────────────────────

export interface AlertsPageData {
  system: EnergySystem;
  unresolved: Alert[];
  resolved: Alert[];
  bills: import("@/types/energy").Bill[];
  lastCheck: import("@/types/energy").Alert["created_at"] | null;
}

/** Loads everything the /alerts page renders. */
export async function getAlertsPageData(
  supabase: SupabaseClient,
  system: EnergySystem
): Promise<AlertsPageData> {
  const [alertsRes, billsRes] = await Promise.all([
    supabase
      .from("alerts")
      .select("*")
      .eq("system_id", system.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("bills")
      .select("*")
      .eq("user_id", system.user_id)
      .eq("system_id", system.id)
      .order("billing_period", { ascending: false })
      .limit(24),
  ]);
  if (alertsRes.error) throw new Error(alertsRes.error.message);
  if (billsRes.error) throw new Error(billsRes.error.message);

  const alerts = (alertsRes.data ?? []) as unknown as Alert[];
  const bills = (billsRes.data ?? []) as unknown as import("@/types/energy").Bill[];

  // Resolve the latest alert per system for "last checked".
  const lastCheck = alerts.reduce<string | null>(
    (latest, a) => (!latest || a.created_at > latest ? a.created_at : latest),
    null
  );

  return {
    system,
    unresolved: alerts.filter((a) => !a.is_resolved),
    resolved: alerts.filter((a) => a.is_resolved),
    bills,
    lastCheck,
  };
}
