"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateSimulationSchema, demoSeedSchema } from "@/lib/validation/simulation";
import { fieldErrors } from "@/lib/validation/auth";
import { generateAndPersist, resetSystemData, seedDemoData } from "@/lib/simulation/service";
import { defaultDailyTarget } from "@/lib/energy/targets";
import type { EnergySystem } from "@/types/energy";

export interface SimulationActionResult {
  ok: boolean;
  error?: string;
  written?: number;
  startDate?: string;
  endDate?: string;
}

async function getOwnedSystem(systemId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in." as const };
  }
  const { data } = await supabase
    .from("energy_systems")
    .select("*")
    .eq("id", systemId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) {
    return { error: "System not found." as const };
  }
  return { supabase, system: data as EnergySystem, userId: user.id };
}

export async function generateDataAction(
  formData: FormData
): Promise<SimulationActionResult> {
  const systemId = String(formData.get("systemId") ?? "");
  const parsed = generateSimulationSchema.safeParse({
    days: formData.get("days"),
    cloudiness: formData.get("cloudiness") || undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: Object.values(fieldErrors(parsed.error))[0] ?? "Invalid request.",
    };
  }

  const owned = await getOwnedSystem(systemId);
  if ("error" in owned) return { ok: false, error: owned.error };

  const result = await generateAndPersist(owned.supabase, {
    system: owned.system,
    dailyKwhTarget: defaultDailyTarget(owned.system.system_type),
    days: parsed.data.days,
    seed: 20260914,
    cloudiness: parsed.data.cloudiness,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/systems/${systemId}`);
  revalidatePath("/dashboard");
  return {
    ok: true,
    written: result.written,
    startDate: result.startDate,
    endDate: result.endDate,
  };
}

export async function resetDataAction(
  formData: FormData
): Promise<SimulationActionResult> {
  const systemId = String(formData.get("systemId") ?? "");
  const owned = await getOwnedSystem(systemId);
  if ("error" in owned) return { ok: false, error: owned.error };

  const result = await resetSystemData(owned.supabase, systemId);
  if (!result.ok) return { ok: false, error: result.error ?? "Reset failed." };

  revalidatePath(`/systems/${systemId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function seedDemoAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string; systemId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const parsed = demoSeedSchema.safeParse({
    scenario: formData.get("scenario") || "factory-alpha",
  });
  if (!parsed.success) return { ok: false, error: "Invalid demo scenario." };

  const result = await seedDemoData(supabase, user.id, parsed.data.scenario);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/systems");
  revalidatePath("/dashboard");
  return { ok: true, systemId: result.systemId };
}
