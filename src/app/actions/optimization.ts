"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runOptimization } from "@/lib/energy/optimization-service";
import { isForecastHorizonKey } from "@/lib/energy/forecast-service";
import type { EnergySystem } from "@/types/energy";

export interface OptimizationActionResult {
  ok: boolean;
  error?: string;
  hoursPlanned?: number;
  expectedSaving?: number;
}

export async function runOptimizationAction(
  formData: FormData
): Promise<OptimizationActionResult> {
  const systemId = String(formData.get("systemId") ?? "");
  const horizon = String(formData.get("horizon") ?? "7d");

  if (!systemId) return { ok: false, error: "Missing system." };
  if (!isForecastHorizonKey(horizon)) {
    return { ok: false, error: "Invalid horizon." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data } = await supabase
    .from("energy_systems")
    .select("*")
    .eq("id", systemId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return { ok: false, error: "System not found." };

  const result = await runOptimization(
    supabase,
    data as EnergySystem,
    horizon
  );
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
    };
  }

  revalidatePath("/battery");
  revalidatePath("/forecasting");
  revalidatePath(`/systems/${systemId}`);
  return {
    ok: true,
    hoursPlanned: result.hoursPlanned,
    expectedSaving: result.expectedSaving,
  };
}
