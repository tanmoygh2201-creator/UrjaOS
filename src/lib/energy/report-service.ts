/**
 * Reports service (Phase 12 — Reports).
 *
 * Assembles periodic summaries (daily / weekly / monthly) for one system:
 * energy totals, tariff-aware cost breakdown, utilization metrics,
 * forecast accuracy, notable alerts, period-over-period deltas, and
 * plain-language insights. Aggregation reuses the analytics engine over an
 * explicit window (and the equally-long previous window for deltas), so the
 * numbers on a report always match the analytics page for the same days.
 *
 * All monetary values are ESTIMATES from the cost engine and must be labeled
 * as such in the UI. CSV export is plain text — no formulas, no macros.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAnalyticsData,
  type AnalyticsData,
  type DailyAnalyticsPoint,
} from "@/lib/energy/analytics-service";
import {
  computeAccuracy,
  gradeAccuracy,
  type AccuracyGrade,
  type ForecastPair,
} from "@/lib/energy/forecast-metrics";
import { addDays, formatDayLabel, localDayKey, startOfLocalDay } from "./time";
import type { Alert, EnergySystem } from "@/types/energy";

// ── Period selection ────────────────────────────────────────────────────────

export const REPORT_PERIODS = [
  { key: "daily", label: "Daily", days: 1 },
  { key: "weekly", label: "Weekly", days: 7 },
  { key: "monthly", label: "Monthly", days: 30 },
] as const;

export type ReportPeriodKey = (typeof REPORT_PERIODS)[number]["key"];

export function isReportPeriodKey(
  value: string | undefined
): value is ReportPeriodKey {
  return REPORT_PERIODS.some((p) => p.key === value);
}

/** Resolves a period to the current window and the equally-long previous one. */
export function resolveReportWindow(periodKey: ReportPeriodKey): {
  startDay: Date;
  days: number;
  prevStartDay: Date;
} {
  const period =
    REPORT_PERIODS.find((p) => p.key === periodKey) ?? REPORT_PERIODS[2];
  const endDay = startOfLocalDay();
  const startDay = addDays(endDay, -(period.days - 1));
  return { startDay, days: period.days, prevStartDay: addDays(startDay, -period.days) };
}

// ── Shapes ──────────────────────────────────────────────────────────────────

export interface ReportDelta {
  current: number;
  previous: number;
  /** Change vs the previous period in %, null when there is no baseline. */
  changePct: number | null;
}

export interface ReportForecastSummary {
  type: "solar" | "consumption";
  mae: number | null;
  mape: number | null;
  samples: number;
  grade: AccuracyGrade | null;
}

export interface ReportAlertSummary {
  openCount: number;
  criticalCount: number;
  raisedInPeriod: Pick<
    Alert,
    "type" | "severity" | "message" | "is_resolved" | "created_at"
  >[];
}

export interface ReportInsight {
  severity: "positive" | "warning" | "critical" | "neutral";
  title: string;
  detail: string;
}

export interface ReportData {
  system: EnergySystem;
  periodKey: ReportPeriodKey;
  periodLabel: string;
  hasData: boolean;
  /** When the report was assembled (ISO). */
  generatedAt: string;
  window: { fromDayKey: string; toDayKey: string; label: string };
  totals: AnalyticsData["totals"];
  metrics: AnalyticsData["metrics"];
  cost: AnalyticsData["cost"];
  daily: DailyAnalyticsPoint[];
  deltas: {
    solar: ReportDelta;
    consumption: ReportDelta;
    gridImport: ReportDelta;
    gridCost: ReportDelta;
    estimatedSavings: ReportDelta;
  };
  forecast: ReportForecastSummary | null;
  alerts: ReportAlertSummary;
  insights: ReportInsight[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function pctChange(current: number, previous: number): number | null {
  if (previous > 0) {
    return Math.round(((current - previous) / previous) * 1000) / 10;
  }
  return null; // no baseline to compare against
}

function delta(current: number, previous: number): ReportDelta {
  return { current, previous, changePct: pctChange(current, previous) };
}

/** Fetches evaluated forecasts inside the window and summarizes accuracy. */
async function summarizeForecastAccuracy(
  supabase: SupabaseClient,
  system: EnergySystem,
  fromIso: string,
  toIso: string
): Promise<ReportForecastSummary[]> {
  const res = await supabase
    .from("forecasts")
    .select("forecast_type, timestamp, predicted_value, actual_value")
    .eq("system_id", system.id)
    .gte("timestamp", fromIso)
    .lt("timestamp", toIso)
    .not("actual_value", "is", null)
    .order("timestamp", { ascending: true })
    .limit(5000);
  if (res.error) throw new Error(res.error.message);

  const rows = (res.data ?? []) as unknown as {
    forecast_type: string;
    predicted_value: number;
    actual_value: number;
  }[];

  const summaries: ReportForecastSummary[] = [];
  for (const type of ["solar", "consumption"] as const) {
    const pairs: ForecastPair[] = rows
      .filter((r) => r.forecast_type === type)
      .map((r) => ({
        timestamp: "",
        predicted: r.predicted_value,
        actual: r.actual_value,
      }));
    if (pairs.length === 0) continue;
    const { mae, mape, samples } = computeAccuracy(pairs);
    summaries.push({
      type,
      mae,
      mape,
      samples,
      grade: gradeAccuracy(mape, samples),
    });
  }
  return summaries;
}

/** Counts unresolved alerts and lists the ones raised inside the period. */
async function summarizeAlerts(
  supabase: SupabaseClient,
  system: EnergySystem,
  fromIso: string
): Promise<ReportAlertSummary> {
  const [openRes, criticalRes, recentRes] = await Promise.all([
    supabase
      .from("alerts")
      .select("severity", { count: "exact", head: true })
      .eq("system_id", system.id)
      .eq("is_resolved", false),
    supabase
      .from("alerts")
      .select("severity", { count: "exact", head: true })
      .eq("system_id", system.id)
      .eq("is_resolved", false)
      .in("severity", ["high", "critical"]),
    supabase
      .from("alerts")
      .select("type, severity, message, is_resolved, created_at")
      .eq("system_id", system.id)
      .gte("created_at", fromIso)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  if (openRes.error) throw new Error(openRes.error.message);
  if (criticalRes.error) throw new Error(criticalRes.error.message);
  if (recentRes.error) throw new Error(recentRes.error.message);

  return {
    openCount: openRes.count ?? 0,
    criticalCount: criticalRes.count ?? 0,
    raisedInPeriod: (recentRes.data ?? []) as unknown as ReportAlertSummary["raisedInPeriod"],
  };
}

// ── Insights (pure — unit-tested) ───────────────────────────────────────────

export interface ReportInsightInput {
  systemName: string;
  hasData: boolean;
  totals: AnalyticsData["totals"];
  metrics: AnalyticsData["metrics"];
  cost: AnalyticsData["cost"];
  deltas: ReportData["deltas"];
  alerts: ReportAlertSummary;
  forecast: ReportForecastSummary[];
}

const SEVERITY_RANK: ReportInsight["severity"][] = [
  "critical",
  "warning",
  "positive",
  "neutral",
];

export function buildReportInsights(input: ReportInsightInput): ReportInsight[] {
  const insights: ReportInsight[] = [];

  if (!input.hasData) {
    insights.push({
      severity: "neutral",
      title: "No data in this period",
      detail: `No readings were recorded for ${input.systemName}. If the system is new, try a longer period — or generate simulation data from the system page.`,
    });
    return insights;
  }

  const { deltas, metrics, totals, alerts } = input;

  if (deltas.estimatedSavings.changePct !== null) {
    const up = deltas.estimatedSavings.changePct >= 0;
    insights.push({
      severity: up ? "positive" : "warning",
      title: up
        ? `Estimated savings up ${deltas.estimatedSavings.changePct}% vs the previous period`
        : `Estimated savings down ${Math.abs(deltas.estimatedSavings.changePct)}% vs the previous period`,
      detail: `Estimated ₹${Math.round(deltas.estimatedSavings.current)} this period vs ₹${Math.round(
        deltas.estimatedSavings.previous
      )} before (valued at your tariff — an estimate, not a guarantee).`,
    });
  }

  if (deltas.gridCost.changePct !== null && deltas.gridCost.changePct > 5) {
    insights.push({
      severity: "warning",
      title: `Grid import cost rose ${deltas.gridCost.changePct}% vs the previous period`,
      detail: `Grid imports changed from ${Math.round(
        deltas.gridImport.previous
      )} kWh to ${Math.round(deltas.gridImport.current)} kWh. Check the analytics page for the hours driving the increase.`,
    });
  }

  if (metrics.energyWastagePct > 15) {
    insights.push({
      severity: metrics.energyWastagePct > 25 ? "critical" : "warning",
      title: `${metrics.energyWastagePct}% of generated solar was exported`,
      detail: `${Math.round(totals.gridExportKwh)} kWh of surplus left the system. Shifting loads into solar hours — or charging the battery then — keeps more of it.`,
    });
  }

  if (metrics.selfConsumptionPct >= 80) {
    insights.push({
      severity: "positive",
      title: `Strong self-consumption: ${metrics.selfConsumptionPct}%`,
      detail: `Most of your solar was used on-site this period. Only ${Math.round(
        totals.gridImportKwh
      )} kWh was imported from the grid.`,
    });
  }

  if (alerts.openCount > 0) {
    insights.push({
      severity: alerts.criticalCount > 0 ? "critical" : "warning",
      title: `${alerts.openCount} unresolved alert${alerts.openCount === 1 ? "" : "s"}`,
      detail:
        alerts.criticalCount > 0
          ? `Includes ${alerts.criticalCount} high-severity alert${alerts.criticalCount === 1 ? "" : "s"} — review them on the Alerts page.`
          : "Review them on the Alerts page before they escalate.",
    });
  }

  const solarForecast = input.forecast.find((f) => f.type === "solar");
  if (solarForecast?.grade) {
    if (solarForecast.grade === "excellent" || solarForecast.grade === "good") {
      insights.push({
        severity: "positive",
        title: `Solar forecast is ${solarForecast.grade} (${solarForecast.mape}% MAPE)`,
        detail: `Predictions tracked actual generation within ${solarForecast.mae} kWh/h on average over ${solarForecast.samples} evaluated hours.`,
      });
    } else if (solarForecast.grade === "poor") {
      insights.push({
        severity: "warning",
        title: `Solar forecast accuracy is poor (${solarForecast.mape}% MAPE)`,
        detail: `Recent forecasts missed by ${solarForecast.mae} kWh/h on average. Treat predictions as rough guidance until accuracy recovers.`,
      });
    }
  }

  return insights.sort(
    (a, b) => SEVERITY_RANK.indexOf(a.severity) - SEVERITY_RANK.indexOf(b.severity)
  );
}

// ── CSV (plain text, RFC-4180-style escaping — no formulas) ─────────────────

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface ReportCsvSection {
  title: string;
  header: string[];
  rows: (string | number)[][];
}

export function buildReportCsv(report: ReportData): string {
  const currency = report.system.currency;
  const sections: ReportCsvSection[] = [
    {
      title: "Summary",
      header: ["Metric", "Value"],
      rows: [
        ["System", report.system.name],
        ["Period", report.window.label],
        ["Days with data", report.totals.daysWithData],
        ["Solar (kWh)", report.totals.solarKwh],
        ["Consumption (kWh)", report.totals.consumptionKwh],
        ["Grid import (kWh)", report.totals.gridImportKwh],
        ["Grid export (kWh)", report.totals.gridExportKwh],
        ["Battery charge (kWh)", report.totals.batteryChargeKwh],
        ["Battery discharge (kWh)", report.totals.batteryDischargeKwh],
        ["Peak demand (kW)", report.totals.peakDemandKw],
        [`Estimated grid cost (${currency})`, report.cost.actualGridCost],
        [`Estimated savings (${currency})`, report.cost.estimatedSavings],
        ["Self-consumption (%)", report.metrics.selfConsumptionPct],
        ["Solar utilization (%)", report.metrics.solarUtilizationPct],
      ],
    },
    {
      title: "Daily breakdown",
      header: [
        "Day",
        "Solar (kWh)",
        "Consumption (kWh)",
        "Grid import (kWh)",
        "Battery charge (kWh)",
        "Battery discharge (kWh)",
        `Grid cost (${currency})`,
        `Estimated savings (${currency})`,
      ],
      rows: report.daily.map((d) => [
        d.day,
        d.solarKwh,
        d.consumptionKwh,
        d.gridImportKwh,
        d.batteryChargeKwh,
        d.batteryDischargeKwh,
        d.cost,
        d.savings,
      ]),
    },
  ];

  if (report.alerts.raisedInPeriod.length > 0) {
    sections.push({
      title: "Alerts raised in period",
      header: ["Created", "Type", "Severity", "Resolved", "Message"],
      rows: report.alerts.raisedInPeriod.map((a) => [
        a.created_at,
        a.type,
        a.severity,
        a.is_resolved ? "yes" : "no",
        a.message,
      ]),
    });
  }

  return sections
    .map((section) =>
      [
        [section.title],
        section.header,
        ...section.rows,
      ]
        .map((row) => row.map(csvCell).join(","))
        .join("\n")
    )
    .join("\n\n");
}

// ── Assembly ────────────────────────────────────────────────────────────────

/** Assembles everything the /reports page (and CSV export) renders. */
export async function getReportData(
  supabase: SupabaseClient,
  system: EnergySystem,
  periodKey: ReportPeriodKey
): Promise<ReportData> {
  const { startDay, days, prevStartDay } = resolveReportWindow(periodKey);
  const fromIso = startOfLocalDay(startDay).toISOString();
  const toIso = startOfLocalDay(addDays(startDay, days)).toISOString();

  const [current, previous, forecastSummaries, alertsSummary] = await Promise.all([
    // The "30d" range key is a neutral default here — the explicit window
    // override below determines the actual aggregation window.
    getAnalyticsData(supabase, system, "30d", { startDay, days }),
    getAnalyticsData(supabase, system, "30d", {
      startDay: prevStartDay,
      days,
    }),
    summarizeForecastAccuracy(supabase, system, fromIso, toIso),
    summarizeAlerts(supabase, system, fromIso),
  ]);

  const periodLabel =
    REPORT_PERIODS.find((p) => p.key === periodKey)?.label ?? "Monthly";

  const fromDayKey = current.fromDayKey ?? localDayKey(startDay);
  const toDayKey = current.toDayKey ?? localDayKey(addDays(startDay, days - 1));
  const windowLabel =
    fromDayKey === toDayKey
      ? formatDayLabel(fromDayKey)
      : `${formatDayLabel(fromDayKey)} – ${formatDayLabel(toDayKey)}`;

  const deltas = {
    solar: delta(current.totals.solarKwh, previous.totals.solarKwh),
    consumption: delta(current.totals.consumptionKwh, previous.totals.consumptionKwh),
    gridImport: delta(current.totals.gridImportKwh, previous.totals.gridImportKwh),
    gridCost: delta(current.cost.actualGridCost, previous.cost.actualGridCost),
    estimatedSavings: delta(current.cost.estimatedSavings, previous.cost.estimatedSavings),
  };

  const report: ReportData = {
    system,
    periodKey,
    periodLabel,
    hasData: current.hasData,
    generatedAt: new Date().toISOString(),
    window: { fromDayKey, toDayKey, label: windowLabel },
    totals: current.totals,
    metrics: current.metrics,
    cost: current.cost,
    daily: current.daily,
    deltas,
    forecast: forecastSummaries.length > 0 ? forecastSummaries[0] : null,
    alerts: alertsSummary,
    insights: [],
  };

  report.insights = buildReportInsights({
    systemName: system.name,
    hasData: current.hasData,
    totals: current.totals,
    metrics: current.metrics,
    cost: current.cost,
    deltas,
    alerts: alertsSummary,
    forecast: forecastSummaries,
  });

  return report;
}
