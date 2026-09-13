/**
 * Simulation database pipeline (spec §47).
 *
 * Simulator → validate (Zod, upstream in actions) → batched upserts →
 * Supabase. Also provides reset and summary helpers used by the UI/API.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { simulate, type SimulationResult } from "./simulate";
import type { EnergySystem } from "@/types/energy";

const BATCH_SIZE = 500; // rows per upsert call (Supabase-friendly)

export type SystemOwnerClient = SupabaseClient;

async function upsertBatches(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[]
): Promise<{ inserted: number; error: string | null }> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error, count } = await supabase
      .from(table)
      .upsert(batch, { onConflict: "system_id,timestamp", count: "exact" });
    if (error) {
      return { inserted, error: error.message };
    }
    inserted += count ?? batch.length;
  }
  return { inserted, error: null };
}

/**
 * Persists a simulation result for a system. The unique (system_id, timestamp)
 * indexes make repeated runs idempotent.
 */
export async function persistSimulation(
  supabase: SupabaseClient,
  result: SimulationResult
): Promise<{ ok: true; written: number } | { ok: false; error: string }> {
  let written = 0;
  const parts: [string, Record<string, unknown>[]][] = [
    ["solar_readings", result.solarRows as unknown as Record<string, unknown>[]],
    [
      "consumption_readings",
      result.consumptionRows as unknown as Record<string, unknown>[],
    ],
    ["battery_readings", result.batteryRows as unknown as Record<string, unknown>[]],
    ["grid_readings", result.gridRows as unknown as Record<string, unknown>[]],
  ];

  for (const [table, rows] of parts) {
    if (rows.length === 0) continue;
    const { inserted, error } = await upsertBatches(
      supabase,
      table,
      rows
    );
    if (error) {
      return { ok: false, error: `${table}: ${error}` };
    }
    written += inserted;
  }
  return { ok: true, written };
}

export interface GenerateOptions {
  system: EnergySystem;
  dailyKwhTarget: number;
  days: number;
  seed: number;
  cloudiness?: number;
  /** Defaults to the last `days` days, ending yesterday. */
  endDate?: Date;
}

/** Generates rows for the last `days` days (ending yesterday) and persists them. */
export async function generateAndPersist(
  supabase: SupabaseClient,
  options: GenerateOptions
): Promise<
  | { ok: true; written: number; startDate: string; endDate: string }
  | { ok: false; error: string }
> {
  const { system, dailyKwhTarget, days, seed, cloudiness } = options;

  const end = options.endDate ?? (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 1); // yesterday
    return d;
  })();

  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));

  const result = simulate({
    system,
    dailyKwhTarget,
    startDate: start,
    endDate: end,
    seed,
    cloudiness,
  });

  const persisted = await persistSimulation(supabase, result);
  if (!persisted.ok) {
    return { ok: false, error: persisted.error };
  }

  return {
    ok: true,
    written: persisted.written,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export interface DataSummary {
  solarDays: number;
  consumptionDays: number;
  batteryDays: number;
  gridDays: number;
  earliest: string | null;
  latest: string | null;
}

/** Counts distinct days of data per table for a system (drives UI states). */
export async function getDataSummary(
  supabase: SupabaseClient,
  systemId: string
): Promise<DataSummary> {
  const dayCounts = await Promise.all(
    (
      [
        "solar_readings",
        "consumption_readings",
        "battery_readings",
        "grid_readings",
      ] as const
    ).map(async (table) => {
      const { data, error } = await supabase
        .from(table)
        .select("timestamp")
        .eq("system_id", systemId)
        .order("timestamp", { ascending: true })
        .limit(100000);
      if (error || !data) return { days: 0, earliest: null, latest: null };

      const days = new Set(
        data.map((r) => new Date(r.timestamp as string).toISOString().slice(0, 10))
      );
      const timestamps = data.map((r) => r.timestamp as string);
      return {
        days: days.size,
        earliest: timestamps[0] ?? null,
        latest: timestamps[timestamps.length - 1] ?? null,
      };
    })
  );

  const [solar, consumption, battery, grid] = dayCounts;
  return {
    solarDays: solar.days,
    consumptionDays: consumption.days,
    batteryDays: battery.days,
    gridDays: grid.days,
    earliest: solar.earliest ?? consumption.earliest ?? null,
    latest: solar.latest ?? consumption.latest ?? null,
  };
}

/** Deletes all reading rows for a system (used by "Reset demo data"). */
export async function resetSystemData(
  supabase: SupabaseClient,
  systemId: string
): Promise<{ ok: boolean; error: string | null }> {
  const results = await Promise.all(
    (
      [
        "solar_readings",
        "consumption_readings",
        "battery_readings",
        "grid_readings",
      ] as const
    ).map(async (table) => {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("system_id", systemId);
      return error?.message ?? null;
    })
  );
  const error = results.find(Boolean) ?? null;
  return { ok: !error, error };
}

/**
 * Creates (or reuses) the Factory Alpha demo system for a user and seeds it
 * with simulated data.
 */
export async function seedDemoData(
  supabase: SupabaseClient,
  userId: string,
  scenarioKey: string = "factory-alpha"
): Promise<
  | { ok: true; systemId: string; written: number }
  | { ok: false; error: string }
> {
  const { DEMO_SCENARIOS } = await import("./demo");
  const scenario = DEMO_SCENARIOS.find((s) => s.key === scenarioKey);
  if (!scenario) {
    return { ok: false, error: `Unknown demo scenario: ${scenarioKey}` };
  }

  // Reuse the demo system if the user already has it (idempotent demo).
  const { data: existing } = await supabase
    .from("energy_systems")
    .select("id")
    .eq("user_id", userId)
    .eq("name", scenario.system.name)
    .maybeSingle();

  let systemId: string;
  if (existing?.id) {
    systemId = existing.id;
  } else {
    const { data: created, error } = await supabase
      .from("energy_systems")
      .insert({ ...scenario.system, user_id: userId })
      .select("id")
      .single();
    if (error || !created) {
      return { ok: false, error: error?.message ?? "Could not create demo system." };
    }
    systemId = (created as { id: string }).id;
  }

  const generated = await generateAndPersist(supabase, {
    system: { ...scenario.system, id: systemId } as EnergySystem,
    dailyKwhTarget: scenario.dailyKwhTarget,
    days: scenario.days,
    seed: 20260914,
    cloudiness: scenario.cloudiness,
  });
  if (!generated.ok) {
    return { ok: false, error: generated.error };
  }

  return { ok: true, systemId, written: generated.written };
}
