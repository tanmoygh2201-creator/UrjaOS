"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runAlertCheck } from "@/lib/energy/alert-service";
import { addBill, isBillingPeriod } from "@/lib/energy/bill-service";
import type { EnergySystem } from "@/types/energy";

export interface AlertActionResult {
  ok: boolean;
  error?: string;
  created?: number;
  skipped?: number;
  daysChecked?: number;
}

/** Loads the owned system or an error result. */
async function requireSystem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  systemId: string
): Promise<{ system: EnergySystem } | { error: string }> {
  const { data } = await supabase
    .from("energy_systems")
    .select("*")
    .eq("id", systemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return { error: "System not found." };
  return { system: data as EnergySystem };
}

export async function runAlertCheckAction(
  formData: FormData
): Promise<AlertActionResult> {
  const systemId = String(formData.get("systemId") ?? "");
  if (!systemId) return { ok: false, error: "Missing system." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const owned = await requireSystem(supabase, user.id, systemId);
  if ("error" in owned) return { ok: false, error: owned.error };

  const result = await runAlertCheck(supabase, owned.system);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/alerts");
  return {
    ok: true,
    created: result.created,
    skipped: result.skipped,
    daysChecked: result.daysChecked,
  };
}

export async function setAlertResolvedAction(
  formData: FormData
): Promise<AlertActionResult> {
  const alertId = String(formData.get("alertId") ?? "");
  const resolve = String(formData.get("resolve") ?? "true") === "true";
  if (!alertId) return { ok: false, error: "Missing alert." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  // Ownership check via the system join, then a scoped update. The DB guard
  // trigger additionally restricts updates to the resolution columns.
  const { data: alert } = await supabase
    .from("alerts")
    .select("id, system_id")
    .eq("id", alertId)
    .maybeSingle();
  if (!alert) return { ok: false, error: "Alert not found." };
  const owned = await requireSystem(supabase, user.id, alert.system_id);
  if ("error" in owned) return { ok: false, error: owned.error };

  const { error } = await supabase
    .from("alerts")
    .update({
      is_resolved: resolve,
      resolved_at: resolve ? new Date().toISOString() : null,
    })
    .eq("id", alertId);
  if (error) {
    return { ok: false, error: "Could not update the alert." };
  }

  revalidatePath("/alerts");
  return { ok: true };
}

export interface BillActionResult {
  ok: boolean;
  error?: string;
}

export async function addBillAction(
  formData: FormData
): Promise<BillActionResult> {
  const systemId = String(formData.get("systemId") ?? "");
  const period = String(formData.get("billingPeriod") ?? "");

  if (!systemId) return { ok: false, error: "Missing system." };
  if (!isBillingPeriod(period)) {
    return { ok: false, error: "Enter the billing month as YYYY-MM (e.g. 2026-08)." };
  }

  const num = (key: string): number => {
    const raw = formData.get(key);
    const parsed = typeof raw === "string" ? Number.parseFloat(raw) : Number.NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
  };
  const energyConsumed = num("energyConsumed");
  const energyCharge = num("energyCharge");
  const fixedCharge = num("fixedCharge");
  const otherCharges = num("otherCharges");
  const totalAmount = num("totalAmount");
  if (
    Number.isNaN(energyConsumed) ||
    Number.isNaN(energyCharge) ||
    Number.isNaN(fixedCharge) ||
    Number.isNaN(otherCharges) ||
    Number.isNaN(totalAmount)
  ) {
    return { ok: false, error: "Enter non-negative numbers in every field." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const owned = await requireSystem(supabase, user.id, systemId);
  if ("error" in owned) return { ok: false, error: owned.error };

  const result = await addBill(supabase, owned.system, {
    billing_period: period,
    energy_consumed: energyConsumed,
    energy_charge: energyCharge,
    fixed_charge: fixedCharge,
    other_charges: otherCharges,
    total_amount: totalAmount,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/alerts");
  return { ok: true };
}

export async function deleteBillAction(
  formData: FormData
): Promise<BillActionResult> {
  const billId = String(formData.get("billId") ?? "");
  if (!billId) return { ok: false, error: "Missing bill." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { error } = await supabase.from("bills").delete().eq("id", billId).eq("user_id", user.id);
  if (error) return { ok: false, error: "Could not delete the bill." };

  revalidatePath("/alerts");
  return { ok: true };
}
