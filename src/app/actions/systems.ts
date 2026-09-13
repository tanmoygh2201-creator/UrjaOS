"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  validateEnergySystem,
  type EnergySystemInput,
} from "@/lib/validation/system";

export interface SystemFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

export interface SystemActionSuccess {
  ok: true;
  id: string;
}

export interface SystemActionFailure {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string>;
}

export type SystemActionResult = SystemActionSuccess | SystemActionFailure;

/** Converts validated form input into an energy_systems row. */
function toRow(input: EnergySystemInput, userId: string) {
  return {
    user_id: userId,
    name: input.name,
    location: input.location || null,
    system_type: input.systemType,
    solar_capacity_kw: input.solarCapacityKw,
    battery_capacity_kwh: input.batteryCapacityKwh,
    battery_max_charge_kw: input.batteryMaxChargeKw,
    battery_max_discharge_kw: input.batteryMaxDischargeKw,
    min_soc: input.minSoc,
    max_soc: input.maxSoc,
    battery_charge_efficiency: input.batteryChargeEfficiency,
    battery_discharge_efficiency: input.batteryDischargeEfficiency,
    electricity_tariff: input.tariff,
    currency: input.currency,
  };
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function createSystemAction(
  _prevState: SystemFormState,
  formData: FormData
): Promise<SystemFormState> {
  const { supabase, user } = await requireUser();

  const tariffType = formData.get("tariffType") === "tou" ? "tou" : "flat";
  const periods: unknown[] = [];
  if (tariffType === "tou") {
    for (let i = 0; i < 6; i += 1) {
      if (formData.get(`periodName${i}`)) {
        periods.push({
          name: formData.get(`periodName${i}`),
          startHour: formData.get(`periodStart${i}`),
          endHour: formData.get(`periodEnd${i}`),
          rate: formData.get(`periodRate${i}`),
        });
      }
    }
  }

  const validated = validateEnergySystem({
    name: formData.get("name"),
    location: formData.get("location"),
    systemType: formData.get("systemType"),
    solarCapacityKw: formData.get("solarCapacityKw"),
    batteryCapacityKwh: formData.get("batteryCapacityKwh"),
    batteryMaxChargeKw: formData.get("batteryMaxChargeKw"),
    batteryMaxDischargeKw: formData.get("batteryMaxDischargeKw"),
    minSoc: formData.get("minSoc"),
    maxSoc: formData.get("maxSoc"),
    batteryChargeEfficiency: formData.get("batteryChargeEfficiency"),
    batteryDischargeEfficiency: formData.get("batteryDischargeEfficiency"),
    tariff:
      tariffType === "flat"
        ? {
            type: "flat",
            currency: formData.get("currency"),
            rate: formData.get("tariffRate"),
          }
        : { type: "tou", currency: formData.get("currency"), periods },
  });

  if (!validated.ok) {
    return { error: "Please fix the highlighted fields.", fieldErrors: validated.errors };
  }

  const row = toRow(validated.data, user.id);
  const { data, error } = await supabase
    .from("energy_systems")
    .insert(row)
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Could not create the system. Please try again." };
  }

  revalidatePath("/systems");
  revalidatePath("/dashboard");
  redirect(`/systems/${data.id}`);
}

export async function updateSystemAction(
  _prevState: SystemFormState,
  formData: FormData
): Promise<SystemFormState> {
  const { supabase, user } = await requireUser();
  const systemId = String(formData.get("systemId") ?? "");

  const existing = await supabase
    .from("energy_systems")
    .select("id")
    .eq("id", systemId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing.data) {
    return { error: "System not found." };
  }

  const tariffType = formData.get("tariffType") === "tou" ? "tou" : "flat";
  const periods: unknown[] = [];
  if (tariffType === "tou") {
    for (let i = 0; i < 6; i += 1) {
      if (formData.get(`periodName${i}`) && formData.get(`periodName${i}`) !== "") {
        periods.push({
          name: formData.get(`periodName${i}`),
          startHour: formData.get(`periodStart${i}`),
          endHour: formData.get(`periodEnd${i}`),
          rate: formData.get(`periodRate${i}`),
        });
      }
    }
  }

  const validated = validateEnergySystem({
    name: formData.get("name"),
    location: formData.get("location"),
    systemType: formData.get("systemType"),
    solarCapacityKw: formData.get("solarCapacityKw"),
    batteryCapacityKwh: formData.get("batteryCapacityKwh"),
    batteryMaxChargeKw: formData.get("batteryMaxChargeKw"),
    batteryMaxDischargeKw: formData.get("batteryMaxDischargeKw"),
    minSoc: formData.get("minSoc"),
    maxSoc: formData.get("maxSoc"),
    batteryChargeEfficiency: formData.get("batteryChargeEfficiency"),
    batteryDischargeEfficiency: formData.get("batteryDischargeEfficiency"),
    tariff:
      tariffType === "flat"
        ? {
            type: "flat",
            currency: formData.get("currency"),
            rate: formData.get("tariffRate"),
          }
        : { type: "tou", currency: formData.get("currency"), periods },
  });

  if (!validated.ok) {
    return { error: "Please fix the highlighted fields.", fieldErrors: validated.errors };
  }

  const row = toRow(validated.data, user.id);
  const { error } = await supabase
    .from("energy_systems")
    .update(row)
    .eq("id", systemId)
    .eq("user_id", user.id);

  if (error) {
    return { error: "Could not save changes. Please try again." };
  }

  revalidatePath("/systems");
  revalidatePath(`/systems/${systemId}`);
  revalidatePath(`/systems/${systemId}/edit`);
  redirect(`/systems/${systemId}`);
}

export async function deleteSystemAction(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const systemId = String(formData.get("systemId") ?? "");

  const { error } = await supabase
    .from("energy_systems")
    .delete()
  .eq("id", systemId)
    .eq("user_id", user.id);

  if (error) {
    redirect(`/systems/${systemId}?error=delete_failed`);
  }

  revalidatePath("/systems");
  revalidatePath("/dashboard");
  redirect("/systems?deleted=1");
}
