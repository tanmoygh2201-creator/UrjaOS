/**
 * Bill analyzer service (Phase 11, bills table).
 *
 * Users enter the utility bill for a month; the analyzer re-derives what the
 * grid import *should* have cost from the stored readings (hourly, at the
 * tariff in effect — the same pricing pass the analytics service uses) and
 * classifies the bill as under / within / over that estimate.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyBill, type BillVerdict } from "@/lib/energy/alert-engine";
import { fetchAllPages } from "@/lib/energy/paged-fetch";
import { localHour } from "@/lib/energy/time";
import { getTariffRateForHour } from "@/lib/validation/tariff";
import type { Bill, EnergySystem } from "@/types/energy";

/** ISO range covering a billing month (e.g. "2026-08") in local time. */
function monthRange(period: string): { fromIso: string; toIso: string } {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(y, (m ?? 1) - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m ?? 1, 1, 0, 0, 0, 0); // exclusive upper bound
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}

/** Sums grid import cost for a month, pricing each hour at its tariff. */
export async function estimateMonthGridCost(
  supabase: SupabaseClient,
  system: EnergySystem,
  period: string
): Promise<number> {
  const { fromIso, toIso } = monthRange(period);
  const grid = await fetchAllPages<{
    timestamp: string;
    import_kw: number;
  }>(supabase, "grid_readings", "timestamp, import_kw", system.id, fromIso, toIso);

  let cost = 0;
  for (const row of grid) {
    if (row.import_kw <= 0) continue;
    const rate = getTariffRateForHour(system.electricity_tariff, localHour(row.timestamp));
    cost += row.import_kw * rate;
  }
  return Math.round(cost * 100) / 100;
}

/** Validates a billing period ("YYYY-MM"). */
export function isBillingPeriod(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export interface AddBillInput {
  billing_period: string;
  energy_consumed: number;
  energy_charge: number;
  fixed_charge: number;
  other_charges: number;
  total_amount: number;
}

/** Inserts a bill for this system (unique per system + period). */
export async function addBill(
  supabase: SupabaseClient,
  system: EnergySystem,
  input: AddBillInput
): Promise<{ ok: true; bill: Bill } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("bills")
    .insert({
      user_id: system.user_id,
      system_id: system.id,
      billing_period: input.billing_period,
      energy_consumed: input.energy_consumed,
      energy_charge: input.energy_charge,
      fixed_charge: input.fixed_charge,
      other_charges: input.other_charges,
      total_amount: input.total_amount,
    })
    .select()
    .single();
  if (error) {
    const duplicate = error.code === "23505";
    return {
      ok: false,
      error: duplicate
        ? "A bill for this system and month already exists — delete it first if you want to replace it."
        : `Could not save the bill: ${error.message}`,
    };
  }
  return { ok: true, bill: data as unknown as Bill };
}

export interface BillAnalysis {
  bill: Bill;
  verdict: BillVerdict;
  /** kWh of grid import the readings recorded for the bill's month. */
  gridImportKwh: number;
  hasReadings: boolean;
}

/**
 * Assembles the analyzer view: every bill for the system, each compared to
 * the estimated cost from readings for its month.
 */
export async function getBillAnalysis(
  supabase: SupabaseClient,
  system: EnergySystem
): Promise<BillAnalysis[]> {
  const { data, error } = await supabase
    .from("bills")
    .select("*")
    .eq("user_id", system.user_id)
    .eq("system_id", system.id)
    .order("billing_period", { ascending: false })
    .limit(24);
  if (error) throw new Error(error.message);

  const bills = (data ?? []) as unknown as Bill[];
  const analyses = await Promise.all(
    bills.map(async (bill): Promise<BillAnalysis> => {
      const { fromIso, toIso } = monthRange(bill.billing_period);
      const grid = await fetchAllPages<{ timestamp: string; import_kw: number }>(
        supabase,
        "grid_readings",
        "timestamp, import_kw",
        system.id,
        fromIso,
        toIso
      );
      // One pass over the month's hours: kWh total + tariff-priced cost.
      let gridImportKwh = 0;
      let estimatedCost = 0;
      for (const row of grid) {
        gridImportKwh += row.import_kw;
        if (row.import_kw > 0) {
          const rate = getTariffRateForHour(
            system.electricity_tariff,
            localHour(row.timestamp)
          );
          estimatedCost += row.import_kw * rate;
        }
      }
      gridImportKwh = Math.round(gridImportKwh * 1000) / 1000;
      estimatedCost = Math.round(estimatedCost * 100) / 100;
      return {
        bill,
        verdict: classifyBill(bill.total_amount, estimatedCost),
        gridImportKwh,
        hasReadings: grid.length > 0,
      };
    })
  );
  return analyses;
}
