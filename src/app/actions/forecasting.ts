"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateForecasts } from "@/lib/energy/forecast-service";
import { isForecastHorizonKey } from "@/lib/energy/forecast-service";
import type { EnergySystem } from "@/types/energy";

export interface ForecastActionResult {
  ok: boolean;
  error?: string;
  written?: number;
  backfilled?: number;
}

export async function generateForecastsAction(
  formData: FormData
): Promise<ForecastActionResult> {
  const systemId = String(formData.get("systemId") ?? "");
  const horizon = String(formData.get("horizon") ?? "7d");

  if (!systemId) return { ok: false, error: "Missing system." };
  if (!isForecastHorizonKey(horizon)) {
    return { ok: false, error: "Invalid forecast horizon." };
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

  const result = await generateForecasts(
    supabase,
    data as EnergySystem,
    horizon
  );
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.error === "NO_HISTORY"
          ? "Not enough history yet — generate at least a few days of readings first."
          : result.error,
    };
  }

  revalidatePath("/forecasting");
  revalidatePath(`/systems/${systemId}`);
  return {
    ok: true,
    written: result.written,
    backfilled: result.backfilled,
  };
}
