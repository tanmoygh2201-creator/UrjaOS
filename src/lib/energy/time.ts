/**
 * Time helpers shared by analytics, dashboards, and reports.
 *
 * Reading timestamps are stored as UTC ISO strings, but users think in local
 * days. Every aggregation must bucket by the viewer's LOCAL day — grouping by
 * `timestamp.slice(0, 10)` splits days at the UTC boundary (e.g. 05:30 IST)
 * and silently corrupts daily totals.
 */

/** Local-day key for a timestamp, e.g. "2026-09-14". */
export function localDayKey(timestamp: string | Date): string {
  const d = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** A Date set to local midnight of the given day (or today). */
export function startOfLocalDay(date?: Date): Date {
  const d = date ? new Date(date) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Inclusive local date range [start, end] as ISO timestamps for queries. */
export function localDayRangeIso(
  startDate: Date,
  endDate: Date
): { fromIso: string; toIso: string } {
  const from = startOfLocalDay(startDate);
  const to = startOfLocalDay(endDate);
  to.setDate(to.getDate() + 1); // exclusive upper bound = start of next day
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

/** Adds n days to a date (does not mutate the input). */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Local hour (0-23) of an ISO timestamp. */
export function localHour(timestamp: string): number {
  return new Date(timestamp).getHours();
}

/** Formats a local day key as a short label, e.g. "14 Sep". */
export function formatDayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Formats an ISO timestamp as "HH:00" in local time. */
export function formatHourLabel(timestamp: string): string {
  const h = new Date(timestamp).getHours();
  return `${String(h).padStart(2, "0")}:00`;
}
