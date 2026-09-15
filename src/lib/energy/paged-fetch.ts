import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PostgREST caps a single SELECT at 1000 rows by default (Supabase config),
 * which would silently truncate long ranges (1y ≈ 8760 rows per table) and
 * corrupt totals. This walks the range in pages until exhausted.
 */
export async function fetchAllPages<T extends { timestamp: string }>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  systemId: string,
  fromIso: string,
  toIso: string
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("system_id", systemId)
      .gte("timestamp", fromIso)
      .lt("timestamp", toIso)
      .order("timestamp", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      throw new Error(`Failed to load ${table}: ${error.message}`);
    }
    all.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < PAGE) break;
  }
  return all;
}
