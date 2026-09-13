import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Schema guard tests: parse the SQL migrations and assert structural
 * guarantees. They are no substitute for integration tests against a real
 * database, but they catch the most common mistakes early: a table added
 * without RLS, a time-series table without a uniqueness/index strategy, or a
 * migration file that is accidentally empty.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function readMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8"),
    }));
}

const allSql = () =>
  readMigrations()
    .map((m) => m.sql)
    .join("\n");

const stripComments = (sql: string) =>
  sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

/** The set of tables UrjaOS requires (spec §9). */
const REQUIRED_TABLES = [
  "profiles",
  "energy_systems",
  "solar_readings",
  "consumption_readings",
  "battery_readings",
  "grid_readings",
  "forecasts",
  "optimization_schedules",
  "alerts",
  "bills",
] as const;

/** Tables that must deduplicate on (system_id, timestamp). */
const TIME_SERIES_TABLES = [
  "solar_readings",
  "consumption_readings",
  "battery_readings",
  "grid_readings",
] as const;

describe("urjaos database schema", () => {
  it("contains every required table", () => {
    const sql = allSql();
    for (const table of REQUIRED_TABLES) {
      expect(sql, `missing table: ${table}`).toMatch(
        new RegExp(`create table if not exists public\\.${table} \\(`)
      );
    }
  });

  it("enables RLS on every table", () => {
    const sql = stripComments(allSql());
    for (const table of REQUIRED_TABLES) {
      expect(sql, `RLS not enabled for: ${table}`).toMatch(
        new RegExp(
          `alter table public\\.${table} enable row level security;`
        )
      );
    }
  });

  it("defines at least one policy for every table", () => {
    const sql = stripComments(allSql());
    for (const table of REQUIRED_TABLES) {
      expect(sql, `no RLS policy for: ${table}`).toMatch(
        new RegExp(`on public\\.${table} for`)
      );
    }
  });

  it("never disables RLS anywhere", () => {
    expect(allSql()).not.toMatch(/disable row level security/);
  });

  it("references auth.users with cascade deletes from owned tables", () => {
    const sql = allSql();
    expect(sql).toMatch(
      /energy_systems[\s\S]*?user_id uuid not null references auth\.users \(id\) on delete cascade/
    );
    expect(sql).toMatch(/profiles[\s\S]*?user_id uuid not null unique references auth\.users \(id\) on delete cascade/);
  });

  it("cascades child tables from energy_systems", () => {
    const sql = allSql();
    for (const table of TIME_SERIES_TABLES) {
      expect(sql).toMatch(
        new RegExp(
          `${table}[\\s\\S]*?system_id uuid not null references public\\.energy_systems \\(id\\) on delete cascade`
        )
      );
    }
  });

  it("gives every time-series table a unique (system_id, timestamp) index", () => {
    const sql = allSql();
    for (const table of TIME_SERIES_TABLES) {
      expect(sql, `no unique system/timestamp index on: ${table}`).toMatch(
        new RegExp(
          `create unique index if not exists ${table}_system_ts_idx[\\s\\S]*?on public\\.${table} \\(system_id, timestamp desc\\)`
        )
      );
    }
  });

  it("indexes timestamps on every time-series table", () => {
    const sql = allSql();
    for (const table of TIME_SERIES_TABLES) {
      expect(sql, `no timestamp index on: ${table}`).toMatch(
        new RegExp(
          `create index if not exists ${table}_ts_idx[\\s\\S]*?on public\\.${table} \\(timestamp desc\\)`
        )
      );
    }
  });

  it("constrains SOC to the 0-100 range", () => {
    const sql = allSql();
    expect(sql).toMatch(/soc numeric\(5,2\) not null check \(soc >= 0 and soc <= 100\)/);
    expect(sql).toMatch(/min_soc numeric\(5,2\) not null default 10\s+check \(min_soc >= 0 and min_soc <= 100\)/);
  });

  it("requires min_soc < max_soc", () => {
    expect(allSql()).toMatch(
      /constraint min_soc_below_max_soc check \(min_soc < max_soc\)/
    );
  });

  it("keeps battery efficiencies in (0, 1]", () => {
    const sql = allSql();
    expect(sql).toMatch(
      /battery_charge_efficiency numeric\(4,3\) not null default 0\.950\s+check \(battery_charge_efficiency > 0 and battery_charge_efficiency <= 1\)/
    );
    expect(sql).toMatch(
      /battery_discharge_efficiency numeric\(4,3\) not null default 0\.950\s+check \(battery_discharge_efficiency > 0 and battery_discharge_efficiency <= 1\)/
    );
  });

  it("restricts forecast types to solar and consumption", () => {
    expect(allSql()).toMatch(
      /forecast_type text not null check \(forecast_type in \('solar', 'consumption'\)\)/
    );
  });

  it("restricts optimization actions and forbids simultaneous charge+discharge", () => {
    const sql = allSql();
    expect(sql).toMatch(
      /action in \('charge', 'discharge', 'idle', 'grid', 'solar_to_load'\)/
    );
    expect(sql).toMatch(
      /constraint not_charge_and_discharge_simultaneously/
    );
  });

  it("restricts alert severities to the five allowed levels", () => {
    expect(allSql()).toMatch(
      /severity in \('info', 'low', 'medium', 'high', 'critical'\)/
    );
  });

  it("formats billing periods as YYYY-MM", () => {
    expect(allSql()).toContain("billing_period ~ '^\\d{4}-\\d{2}$'");
  });

  it("indexes system ownership on energy_systems", () => {
    expect(allSql()).toMatch(
      /create index if not exists energy_systems_user_id_idx\s+on public\.energy_systems \(user_id\)/
    );
  });

  it("keeps alert updates restricted to resolution columns", () => {
    expect(allSql()).toMatch(
      /alerts can only modify is_resolved and resolved_at/
    );
  });

  it("has no accidentally empty migration files", () => {
    for (const migration of readMigrations()) {
      expect(
        stripComments(migration.sql).trim().length,
        `${migration.name} contains no SQL`
      ).toBeGreaterThan(0);
    }
  });
});
