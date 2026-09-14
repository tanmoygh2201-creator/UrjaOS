/**
 * Forecasting data service (spec §34).
 *
 * Backfills actual values into past forecasts, generates baseline-v1
 * forecasts for a horizon, persists them, and computes MEASURED accuracy
 * (MAE/RMSE/MAPE) from predicted-vs-actual pairs — never fabricated.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  forecastConsumption,
  forecastSolar,
  learnConsumptionPattern,
  learnSolarPattern,
  MODEL_VERSION,
  type ForecastPoint,
} from "./forecast-engine";
import { computeAccuracy, gradeAccuracy } from "./forecast-metrics";
import { formatDayLabel, startOfLocalDay } from "./time";
import type {
  ConsumptionReading,
  EnergySystem,
  SolarReading,
} from "@/types/energy";

// ── Horizon selection (spec §34: next 24h / 7 days) ───────────────────────

export const FORECAST_HORIZONS = [
  { key: "24h", label: "Next 24 hours", days: 1 },
  { key: "7d", label: "Next 7 days", days: 7 },
] as const;

export type ForecastHorizonKey = (typeof FORECAST_HORIZONS)[number]["key"];

export function isForecastHorizonKey(
  value: string | undefined | null
): value is ForecastHorizonKey {
  return FORECAST_HORIZONS.some((h) => h.key === value);
}

export function resolveHorizon(
  key: ForecastHorizonKey
): { label: string; days: number } {
  const found = FORECAST_HORIZONS.find((h) => h.key === key);
  return { label: found?.label ?? "Next 7 days", days: found?.days ?? 7 };
}

// ── Row mapping ───────────────────────────────────────────────────────────

interface ForecastRow {
  system_id: string;
  forecast_type: "solar" | "consumption";
  timestamp: string;
  predicted_value: number;
  actual_value: number | null;
  model_version: string;
}

function toRows(
  systemId: string,
  points: ForecastPoint[]
): ForecastRow[] {
  return points.map((point) => ({
    system_id: systemId,
    forecast_type: point.forecastType,
    timestamp: point.timestamp,
    predicted_value: point.predictedKwh,
    actual_value: null,
    model_version: MODEL_VERSION,
  }));
}

// ── Backfill ──────────────────────────────────────────────────────────────

/**
 * Fills `actual_value` on past forecast rows whose hour has passed and whose
 * actual reading exists. Returns the number of rows updated.
 *
 * Fetches its own readings from the oldest pending hour up to NOW — not just
 * completed days — so today's forecast hours backfill as soon as their
 * readings land. Uses per-row updates rather than SQL joins: RLS applies
 * through the user's client and volumes are modest (≤ 1000 pending rows).
 */
export async function backfillActuals(
  supabase: SupabaseClient,
  systemId: string
): Promise<{ updated: number; error: string | null }> {
  const nowIso = new Date().toISOString();
  const { data: pending, error } = await supabase
    .from("forecasts")
    .select("id, forecast_type, timestamp, actual_value")
    .eq("system_id", systemId)
    .lt("timestamp", nowIso)
    .is("actual_value", null)
    .order("timestamp", { ascending: true })
    .limit(1000);
  if (error) return { updated: 0, error: error.message };
  if (!pending || pending.length === 0) return { updated: 0, error: null };

  const pendingRows = pending as unknown as {
    id: string;
    forecast_type: string;
    timestamp: string;
  }[];
  const oldestIso = pendingRows[0].timestamp;

  const [solarRes, consumptionRes] = await Promise.all([
    supabase
      .from("solar_readings")
      .select("timestamp, energy_kwh")
      .eq("system_id", systemId)
      .gte("timestamp", oldestIso)
      .lt("timestamp", nowIso)
      .limit(5000),
    supabase
      .from("consumption_readings")
      .select("timestamp, energy_kwh")
      .eq("system_id", systemId)
      .gte("timestamp", oldestIso)
      .lt("timestamp", nowIso)
      .limit(5000),
  ]);
  if (solarRes.error) return { updated: 0, error: solarRes.error.message };
  if (consumptionRes.error) {
    return { updated: 0, error: consumptionRes.error.message };
  }

  const solarByTimestamp = new Map(
    ((solarRes.data ?? []) as unknown as { timestamp: string; energy_kwh: number }[])
      .map((r) => [r.timestamp, r.energy_kwh])
  );
  const consumptionByTimestamp = new Map(
    ((consumptionRes.data ?? []) as unknown as { timestamp: string; energy_kwh: number }[])
      .map((r) => [r.timestamp, r.energy_kwh])
  );

  let updated = 0;
  for (const row of pendingRows) {
    const table =
      row.forecast_type === "solar" ? solarByTimestamp : consumptionByTimestamp;
    const actual = table.get(row.timestamp);
    if (actual === undefined) continue;

    const { error: updateError } = await supabase
      .from("forecasts")
      .update({ actual_value: actual })
      .eq("id", row.id);
    if (updateError) return { updated, error: updateError.message };
    updated += 1;
  }

  return { updated, error: null };
}

// ── Generation ────────────────────────────────────────────────────────────

export interface GenerateForecastsResult {
  ok: boolean;
  error?: string;
  written?: number;
  backfilled?: number;
  horizonDays?: number;
}

export async function generateForecasts(
  supabase: SupabaseClient,
  system: EnergySystem,
  horizonKey: ForecastHorizonKey
): Promise<GenerateForecastsResult> {
  const horizon = resolveHorizon(horizonKey);

  // Lookback: 21 days of readings is enough for stable hour-of-week medians
  // (3 samples per slot) without making every page load expensive.
  const lookbackDays = 21;
  const toDay = startOfLocalDay();
  const fromDay = new Date(toDay);
  fromDay.setDate(fromDay.getDate() - lookbackDays);
  const fromIso = fromDay.toISOString();
  const toIso = toDay.toISOString();

  const [solarRes, consumptionRes] = await Promise.all([
    supabase
      .from("solar_readings")
      .select("timestamp, energy_kwh")
      .eq("system_id", system.id)
      .gte("timestamp", fromIso)
      .lt("timestamp", toIso)
      .order("timestamp", { ascending: true })
      .limit(1000),
    supabase
      .from("consumption_readings")
      .select("timestamp, energy_kwh")
      .eq("system_id", system.id)
      .gte("timestamp", fromIso)
      .lt("timestamp", toIso)
      .order("timestamp", { ascending: true })
      .limit(1000),
  ]);

  if (solarRes.error) return { ok: false, error: solarRes.error.message };
  if (consumptionRes.error) {
    return { ok: false, error: consumptionRes.error.message };
  }

  const solar = (solarRes.data ?? []) as unknown as SolarReading[];
  const consumption = (consumptionRes.data ?? []) as unknown as ConsumptionReading[];

  // No history → nothing to learn from; the page shows an explain-empty state.
  if (solar.length === 0 && consumption.length === 0) {
    return { ok: false, error: "NO_HISTORY" };
  }

  const solarLearning = learnSolarPattern(solar);
  const consumptionLearning = learnConsumptionPattern(consumption);
  const points = [
    ...forecastSolar(solarLearning, horizon.days, toDay),
    ...forecastConsumption(consumptionLearning, horizon.days, toDay),
  ];

  // Idempotent writes: replace this system's future rows for this model.
  const { error: deleteError } = await supabase
    .from("forecasts")
    .delete()
    .eq("system_id", system.id)
    .eq("model_version", MODEL_VERSION)
    .gte("timestamp", toIso);
  if (deleteError) return { ok: false, error: deleteError.message };

  const rows = toRows(system.id, points);
  for (let i = 0; i < rows.length; i += 500) {
    const { error: insertError } = await supabase
      .from("forecasts")
      .insert(rows.slice(i, i + 500));
    if (insertError) return { ok: false, error: insertError.message };
  }

  // Backfill any actuals that became available since the last run.
  const backfill = await backfillActuals(supabase, system.id);
  if (backfill.error) {
    return { ok: false, error: backfill.error };
  }

  return {
    ok: true,
    written: rows.length,
    backfilled: backfill.updated,
    horizonDays: horizon.days,
  };
}

// ── Page data ─────────────────────────────────────────────────────────────

export interface ForecastAccuracy {
  mae: number;
  rmse: number;
  mape: number;
  samples: number;
  grade: "excellent" | "good" | "fair" | "poor";
}

export interface ForecastTypeBlock {
  type: "solar" | "consumption";
  /** Measured accuracy over evaluated past forecasts. */
  accuracy: ForecastAccuracy | null; // null → no evaluated samples yet
  /** Next hours from now, for the preview chart. */
  upcoming: { timestamp: string; label: string; predictedKwh: number }[];
  /** Predicted total over the horizon. */
  horizonTotalKwh: number;
  /** Measured daily MAE for the last 7 evaluated days, newest first. */
  dailyMae: { day: string; label: string; mae: number }[];
  /**
   * Evaluated predicted-vs-actual series for the chart, downsampled to at
   * most ~240 points for readability.
   */
  evaluatedSeries: { label: string; predicted: number; actual: number }[];
}

export interface ForecastPageData {
  system: EnergySystem;
  horizonKey: ForecastHorizonKey;
  horizonLabel: string;
  hasForecasts: boolean;
  hasEvaluated: boolean;
  solar: ForecastTypeBlock;
  consumption: ForecastTypeBlock;
  /** When the next generation is needed: past rows still awaiting actuals. */
  pendingActuals: number;
  modelVersion: string;
}

interface PairRow {
  forecast_type: string;
  timestamp: string;
  predicted_value: number;
  actual_value: number | null;
}

const UPCOMING_HOURS = 12;

/** Assembles everything the /forecasting page renders. */
export async function getForecastPageData(
  supabase: SupabaseClient,
  system: EnergySystem,
  horizonKey: ForecastHorizonKey
): Promise<ForecastPageData> {
  const horizon = resolveHorizon(horizonKey);
  const nowIso = new Date().toISOString();
  const horizonEnd = new Date(startOfLocalDay());
  horizonEnd.setDate(horizonEnd.getDate() + horizon.days);
  const horizonEndIso = horizonEnd.toISOString();

  // Evaluated rows: past forecasts with an actual value (any model version).
  // Upcoming rows: future forecasts from now to the horizon end.
  const [evaluatedRes, upcomingRes, pendingRes] = await Promise.all([
    supabase
      .from("forecasts")
      .select("forecast_type, timestamp, predicted_value, actual_value")
      .eq("system_id", system.id)
      .lt("timestamp", nowIso)
      .not("actual_value", "is", null)
      .order("timestamp", { ascending: true })
      .limit(5000),
    supabase
      .from("forecasts")
      .select("forecast_type, timestamp, predicted_value")
      .eq("system_id", system.id)
      .gte("timestamp", nowIso)
      .lt("timestamp", horizonEndIso)
      .order("timestamp", { ascending: true })
      .limit(5000),
    supabase
      .from("forecasts")
      .select("id", { count: "exact", head: true })
      .eq("system_id", system.id)
      .lt("timestamp", nowIso)
      .is("actual_value", null),
  ]);

  const evaluated = (evaluatedRes.data ?? []) as unknown as PairRow[];
  const upcoming = (upcomingRes.data ?? []) as unknown as {
    forecast_type: string;
    timestamp: string;
    predicted_value: number;
  }[];

  const pendingActuals = pendingRes.count ?? 0;

  function buildBlock(type: "solar" | "consumption"): ForecastTypeBlock {
    const pairs = evaluated
      .filter((r) => r.forecast_type === type)
      .map((r) => ({
        timestamp: r.timestamp,
        predicted: r.predicted_value,
        actual: r.actual_value as number,
      }));

    const metrics = computeAccuracy(pairs);

    // Daily MAE for the last 7 evaluated days (newest first).
    const byDay = new Map<string, number[]>();
    for (const pair of pairs) {
      const key = new Date(pair.timestamp).toDateString();
      let list = byDay.get(key);
      if (!list) {
        list = [];
        byDay.set(key, list);
      }
      list.push(Math.abs(pair.predicted - pair.actual));
    }
    const dailyMae = [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-7)
      .reverse()
      .map(([day, errors]) => {
        const iso = new Date(day).toISOString();
        return {
          day,
          label: formatDayLabel(iso.slice(0, 10)),
          mae: Math.round(
            (errors.reduce((s, e) => s + e, 0) / errors.length) * 1000
          ) / 1000,
        };
      });

    // Next 12 upcoming hours for the preview chart.
    const upcomingForType = upcoming
      .filter((r) => r.forecast_type === type)
      .slice(0, UPCOMING_HOURS)
      .map((r) => ({
        timestamp: r.timestamp,
        label: formatHourLabelLocal(r.timestamp),
        predictedKwh: r.predicted_value,
      }));

    const horizonTotalKwh = upcoming
      .filter((r) => r.forecast_type === type)
      .reduce((sum, r) => sum + r.predicted_value, 0);

    // Downsample the evaluated series for the predicted-vs-actual chart.
    const allPairs = pairs.map((pair) => ({
      label: pairLabel(pair.timestamp),
      predicted: pair.predicted,
      actual: pair.actual,
    }));
    const stride = Math.max(1, Math.ceil(allPairs.length / 240));
    const evaluatedSeries =
      stride > 1
        ? allPairs.filter((_, index) => index % stride === 0)
        : allPairs;

    return {
      type,
      accuracy:
        metrics.samples > 0
          ? { ...metrics, grade: gradeAccuracy(metrics.mape, metrics.samples) }
          : null,
      upcoming: upcomingForType,
      horizonTotalKwh: Math.round(horizonTotalKwh * 10) / 10,
      dailyMae,
      evaluatedSeries,
    };
  }

  const hasForecasts = upcoming.length > 0;

  return {
    system,
    horizonKey,
    horizonLabel: horizon.label,
    hasForecasts,
    hasEvaluated: evaluated.length > 0,
    solar: buildBlock("solar"),
    consumption: buildBlock("consumption"),
    pendingActuals,
    modelVersion: MODEL_VERSION,
  };
}

function formatHourLabelLocal(timestamp: string): string {
  const h = new Date(timestamp).getHours();
  return `${String(h).padStart(2, "0")}:00`;
}

/** Chart label for an evaluated hour, e.g. "12 Sep 14:00". */
function pairLabel(timestamp: string): string {
  const dayKey = new Date(timestamp);
  const day = dayKey.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  return `${day} ${formatHourLabelLocal(timestamp)}`;
}
