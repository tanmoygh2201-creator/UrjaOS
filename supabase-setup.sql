-- UrjaOS one-time database setup.
-- Paste the ENTIRE contents into the Supabase SQL Editor and click Run.
-- Generated from supabase/migrations/* (keep both in sync — tests enforce it).

begin;

-- UrjaOS Phase 2: user profiles.
-- A profile row is created automatically for every new auth user via trigger,
-- and is protected by Row Level Security so users only see their own profile.

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  role text not null default 'user'
    check (role in ('user', 'admin', 'energy_manager')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Application profiles for authenticated users.';

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy: profiles are removed by the cascade from auth.users.

create index if not exists profiles_user_id_idx on public.profiles (user_id);

-- Auto-create a profile whenever a user signs up in Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
-- UrjaOS Phase 3 (1/4): energy systems + shared RLS helper functions.
--
-- energy_systems is the root of all energy data: every reading, forecast,
-- schedule, and alert belongs to a system, and cascades on delete.
--
-- Helpers:
--   set_updated_at()      generic updated_at trigger
--   is_admin()            role check against profiles (bypasses RLS via definer)
--   can_access_system()   owner-or-admin check for child tables' RLS policies

-- ── Shared helpers ──────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Admin check. SECURITY DEFINER so policies on child tables can evaluate the
-- caller's role without triggering recursive RLS lookups on profiles.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from anon;
-- ── energy_systems ──────────────────────────────────────────────────────────

create table if not exists public.energy_systems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  location text,
  system_type text not null default 'residential'
    check (system_type in ('residential', 'commercial', 'industrial')),
  solar_capacity_kw numeric(10,2) not null default 0
    check (solar_capacity_kw >= 0),
  battery_capacity_kwh numeric(10,2) not null default 0
    check (battery_capacity_kwh >= 0),
  battery_max_charge_kw numeric(10,2) not null default 0
    check (battery_max_charge_kw >= 0),
  battery_max_discharge_kw numeric(10,2) not null default 0
    check (battery_max_discharge_kw >= 0),
  min_soc numeric(5,2) not null default 10
    check (min_soc >= 0 and min_soc <= 100),
  max_soc numeric(5,2) not null default 90
    check (max_soc >= 0 and max_soc <= 100),
  battery_charge_efficiency numeric(4,3) not null default 0.950
    check (battery_charge_efficiency > 0 and battery_charge_efficiency <= 1),
  battery_discharge_efficiency numeric(4,3) not null default 0.950
    check (battery_discharge_efficiency > 0 and battery_discharge_efficiency <= 1),
  -- Tariff configuration: flat rate or time-of-use periods. Shape is validated
  -- in the application layer (Zod); here we only require a JSON object.
  electricity_tariff jsonb not null
    default '{"type": "flat", "currency": "INR", "rate": 8.5}'
    check (jsonb_typeof(electricity_tariff) = 'object'),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint min_soc_below_max_soc check (min_soc < max_soc)
);

comment on table public.energy_systems is
  'Solar + battery + grid systems owned by users. Root of the data model.';

-- Ownership check for all tables that reference energy_systems.
-- Defined AFTER the table above on purpose: PostgreSQL validates SQL-language
-- function bodies at CREATE time (check_function_bodies defaults to on), so a
-- body referencing a not-yet-created table fails with 42P01.
create or replace function public.can_access_system(p_system_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.energy_systems s
    where s.id = p_system_id
      and (s.user_id = auth.uid() or public.is_admin())
  );
$$;

revoke all on function public.can_access_system(uuid) from anon;

alter table public.energy_systems enable row level security;

create policy "Users can view own systems (admins can view all)"
  on public.energy_systems for select
  using (user_id = auth.uid() or public.is_admin());

create policy "Users can create own systems"
  on public.energy_systems for insert
  with check (user_id = auth.uid());

-- Ownership cannot be transferred: WITH CHECK rejects any update that points
-- user_id at another account.
create policy "Users can update own systems"
  on public.energy_systems for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own systems"
  on public.energy_systems for delete
  using (user_id = auth.uid());

create index if not exists energy_systems_user_id_idx
  on public.energy_systems (user_id);
create index if not exists energy_systems_created_at_idx
  on public.energy_systems (created_at desc);

drop trigger if exists set_energy_systems_updated_at on public.energy_systems;
create trigger set_energy_systems_updated_at
  before update on public.energy_systems
  for each row execute function public.set_updated_at();
-- UrjaOS Phase 3 (2/4): time-series reading tables.
--
-- All four tables share the same shape:
--   - unique (system_id, timestamp): deduplicates simulator/ingest writes and
--     enables idempotent upserts.
--   - CHECK constraints mirror the Zod validation layer.
--   - RLS via can_access_system(system_id) — only the owner (or an admin)
--     can read or write rows.
--   - Indexes support the common queries: latest value, range scans, and
--     per-system ownership filtering.

-- ── solar_readings ──────────────────────────────────────────────────────────

create table if not exists public.solar_readings (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.energy_systems (id) on delete cascade,
  timestamp timestamptz not null,
  generation_kw numeric(10,3) not null check (generation_kw >= 0),
  energy_kwh numeric(10,3) not null check (energy_kwh >= 0),
  irradiance numeric(10,2),           -- W/m², nullable (simulator may omit)
  temperature numeric(5,1),           -- °C, nullable
  created_at timestamptz not null default now()
);

comment on table public.solar_readings is
  'Solar PV generation telemetry, one row per interval per system.';

alter table public.solar_readings enable row level security;

create policy "System owner can read solar readings"
  on public.solar_readings for select
  using (public.can_access_system(system_id));

create policy "System owner can insert solar readings"
  on public.solar_readings for insert
  with check (public.can_access_system(system_id));

create policy "System owner can delete solar readings"
  on public.solar_readings for delete
  using (public.can_access_system(system_id));

create unique index if not exists solar_readings_system_ts_idx
  on public.solar_readings (system_id, timestamp desc);
create index if not exists solar_readings_ts_idx
  on public.solar_readings (timestamp desc);

-- ── consumption_readings ────────────────────────────────────────────────────

create table if not exists public.consumption_readings (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.energy_systems (id) on delete cascade,
  timestamp timestamptz not null,
  load_kw numeric(10,3) not null check (load_kw >= 0),
  energy_kwh numeric(10,3) not null check (energy_kwh >= 0),
  created_at timestamptz not null default now()
);

comment on table public.consumption_readings is
  'Electricity consumption telemetry, one row per interval per system.';

alter table public.consumption_readings enable row level security;

create policy "System owner can read consumption readings"
  on public.consumption_readings for select
  using (public.can_access_system(system_id));

create policy "System owner can insert consumption readings"
  on public.consumption_readings for insert
  with check (public.can_access_system(system_id));

create policy "System owner can delete consumption readings"
  on public.consumption_readings for delete
  using (public.can_access_system(system_id));

create unique index if not exists consumption_readings_system_ts_idx
  on public.consumption_readings (system_id, timestamp desc);
create index if not exists consumption_readings_ts_idx
  on public.consumption_readings (timestamp desc);

-- ── battery_readings ────────────────────────────────────────────────────────

create table if not exists public.battery_readings (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.energy_systems (id) on delete cascade,
  timestamp timestamptz not null,
  soc numeric(5,2) not null check (soc >= 0 and soc <= 100),
  soh numeric(5,2) not null default 100
    check (soh > 0 and soh <= 100),
  voltage numeric(8,2),               -- V, nullable
  current numeric(8,3),               -- A (negative = discharge), nullable
  temperature numeric(5,1),           -- °C, nullable
  charge_power numeric(10,3) not null default 0
    check (charge_power >= 0),
  discharge_power numeric(10,3) not null default 0
    check (discharge_power >= 0),
  created_at timestamptz not null default now()
);

comment on table public.battery_readings is
  'Battery state telemetry (SOC, SOH, power flows), one row per interval.';

alter table public.battery_readings enable row level security;

create policy "System owner can read battery readings"
  on public.battery_readings for select
  using (public.can_access_system(system_id));

create policy "System owner can insert battery readings"
  on public.battery_readings for insert
  with check (public.can_access_system(system_id));

create policy "System owner can delete battery readings"
  on public.battery_readings for delete
  using (public.can_access_system(system_id));

create unique index if not exists battery_readings_system_ts_idx
  on public.battery_readings (system_id, timestamp desc);
create index if not exists battery_readings_ts_idx
  on public.battery_readings (timestamp desc);

-- ── grid_readings ───────────────────────────────────────────────────────────

create table if not exists public.grid_readings (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.energy_systems (id) on delete cascade,
  timestamp timestamptz not null,
  import_kw numeric(10,3) not null check (import_kw >= 0),
  export_kw numeric(10,3) not null default 0 check (export_kw >= 0),
  tariff numeric(10,4),               -- ₹/kWh in effect at reading time
  created_at timestamptz not null default now()
);

comment on table public.grid_readings is
  'Grid import/export telemetry with the tariff in effect, per interval.';

alter table public.grid_readings enable row level security;

create policy "System owner can read grid readings"
  on public.grid_readings for select
  using (public.can_access_system(system_id));

create policy "System owner can insert grid readings"
  on public.grid_readings for insert
  with check (public.can_access_system(system_id));

create policy "System owner can delete grid readings"
  on public.grid_readings for delete
  using (public.can_access_system(system_id));

create unique index if not exists grid_readings_system_ts_idx
  on public.grid_readings (system_id, timestamp desc);
create index if not exists grid_readings_ts_idx
  on public.grid_readings (timestamp desc);
-- UrjaOS Phase 3 (3/4): forecasts and optimization schedules.
--
-- forecasts: model predictions (solar/consumption) with actual values filled
--   in later, enabling MAE/RMSE/MAPE accuracy tracking (spec §34).
-- optimization_schedules: hourly battery recommendations produced by the
--   optimization engine (spec §35-38). V1 is decision-support only — these
--   rows are recommendations, never device commands.

-- ── forecasts ───────────────────────────────────────────────────────────────

create table if not exists public.forecasts (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.energy_systems (id) on delete cascade,
  forecast_type text not null check (forecast_type in ('solar', 'consumption')),
  timestamp timestamptz not null,          -- the predicted instant
  predicted_value numeric(12,3) not null check (predicted_value >= 0),
  actual_value numeric(12,3),              -- filled in when the hour passes
  model_version text not null default 'baseline-v1',
  created_at timestamptz not null default now()
);

comment on table public.forecasts is
  'Model predictions with actuals for accuracy measurement (MAE/RMSE/MAPE).';

alter table public.forecasts enable row level security;

create policy "System owner can read forecasts"
  on public.forecasts for select
  using (public.can_access_system(system_id));

create policy "System owner can insert forecasts"
  on public.forecasts for insert
  with check (public.can_access_system(system_id));

create policy "System owner can update forecast actuals"
  on public.forecasts for update
  using (public.can_access_system(system_id))
  with check (public.can_access_system(system_id));

create policy "System owner can delete forecasts"
  on public.forecasts for delete
  using (public.can_access_system(system_id));

create index if not exists forecasts_system_type_ts_idx
  on public.forecasts (system_id, forecast_type, timestamp desc);
create index if not exists forecasts_pending_actuals_idx
  on public.forecasts (system_id, forecast_type)
  where actual_value is null;

-- ── optimization_schedules ──────────────────────────────────────────────────

create table if not exists public.optimization_schedules (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.energy_systems (id) on delete cascade,
  timestamp timestamptz not null,          -- the hour this action applies to
  action text not null
    check (action in ('charge', 'discharge', 'idle', 'grid', 'solar_to_load')),
  charge_power numeric(10,3) not null default 0 check (charge_power >= 0),
  discharge_power numeric(10,3) not null default 0
    check (discharge_power >= 0),
  expected_cost numeric(12,2),             -- simulated cost for this hour
  expected_saving numeric(12,2),           -- vs. the unoptimized baseline
  created_at timestamptz not null default now(),
  -- Exactly one direction may be active in a given hour.
  constraint not_charge_and_discharge_simultaneously
    check (not (charge_power > 0 and discharge_power > 0))
);

comment on table public.optimization_schedules is
  'Recommended hourly battery actions (simulation output, not device control).';

alter table public.optimization_schedules enable row level security;

create policy "System owner can read optimization schedules"
  on public.optimization_schedules for select
  using (public.can_access_system(system_id));

create policy "System owner can insert optimization schedules"
  on public.optimization_schedules for insert
  with check (public.can_access_system(system_id));

create policy "System owner can delete optimization schedules"
  on public.optimization_schedules for delete
  using (public.can_access_system(system_id));

create index if not exists optimization_schedules_system_ts_idx
  on public.optimization_schedules (system_id, timestamp desc);
-- UrjaOS Phase 3 (4/4): alerts and bills.
--
-- alerts: raised by the alert engine (spec §44) — anomalies, threshold
--   breaches, communication failures. In-app only in V1 (spec §45).
-- bills: user-entered utility bills that the analyzer compares against
--   simulated/actual energy data (spec §43).

-- ── alerts ──────────────────────────────────────────────────────────────────

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.energy_systems (id) on delete cascade,
  type text not null,                  -- e.g. solar_underperformance, low_battery
  severity text not null
    default 'info'
    check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  message text not null,
  is_resolved boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

comment on table public.alerts is
  'Anomaly and threshold alerts per system (in-app notifications in V1).';

alter table public.alerts enable row level security;

create policy "System owner can read alerts"
  on public.alerts for select
  using (public.can_access_system(system_id));

create policy "System owner can insert alerts"
  on public.alerts for insert
  with check (public.can_access_system(system_id));

-- Users can only resolve (or re-open) their own alerts; message/type/severity
-- are immutable after creation — updates are restricted to the resolution
-- columns by a column-level trigger below.
create policy "System owner can update alerts"
  on public.alerts for update
  using (public.can_access_system(system_id))
  with check (public.can_access_system(system_id));

create policy "System owner can delete alerts"
  on public.alerts for delete
  using (public.can_access_system(system_id));

create index if not exists alerts_system_created_idx
  on public.alerts (system_id, created_at desc);
-- Partial index for the common "show unresolved alerts" query.
create index if not exists alerts_unresolved_idx
  on public.alerts (system_id, created_at desc)
  where is_resolved = false;

-- Enforce that alert updates may only touch is_resolved / resolved_at.
create or replace function public.enforce_alert_update_columns()
returns trigger
language plpgsql
as $$
begin
  if new.type is distinct from old.type
     or new.severity is distinct from old.severity
     or new.message is distinct from old.message
     or new.system_id is distinct from old.system_id then
    raise exception 'alerts can only modify is_resolved and resolved_at';
  end if;
  return new;
end;
$$;

drop trigger if exists alerts_guard_update_columns on public.alerts;
create trigger alerts_guard_update_columns
  before update on public.alerts
  for each row execute function public.enforce_alert_update_columns();

-- ── bills ───────────────────────────────────────────────────────────────────

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  system_id uuid references public.energy_systems (id) on delete cascade,
  billing_period text not null
    check (billing_period ~ '^\d{4}-\d{2}$'),   -- e.g. '2026-08'
  energy_consumed numeric(12,3) not null check (energy_consumed >= 0),
  energy_charge numeric(12,2) not null default 0 check (energy_charge >= 0),
  fixed_charge numeric(12,2) not null default 0 check (fixed_charge >= 0),
  other_charges numeric(12,2) not null default 0 check (other_charges >= 0),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  created_at timestamptz not null default now()
);

comment on table public.bills is
  'User-entered utility bills used by the bill analyzer (spec §43).';

alter table public.bills enable row level security;

-- Bills belong directly to the user; system_id is optional context.
create policy "Users can read own bills"
  on public.bills for select
  using (user_id = auth.uid());

create policy "Users can insert own bills"
  on public.bills for insert
  with check (user_id = auth.uid());

create policy "Users can update own bills"
  on public.bills for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own bills"
  on public.bills for delete
  using (user_id = auth.uid());

-- One bill per system per billing period (NULL system allowed for
-- user-level bills; Postgres unique treats NULLs as distinct, which is fine).
create unique index if not exists bills_user_system_period_idx
  on public.bills (user_id, coalesce(system_id, '00000000-0000-0000-0000-000000000000'::uuid), billing_period);
create index if not exists bills_user_created_idx
  on public.bills (user_id, created_at desc);
-- UrjaOS fix: RLS UPDATE policies for the time-series reading tables.
--
-- The reading tables (Phase 3) grant SELECT / INSERT / DELETE to the system
-- owner but never UPDATE. The simulator persists rows with an idempotent
-- upsert (`insert ... on conflict (system_id, timestamp) do update`), so any
-- regeneration that overlaps existing timestamps executes the UPDATE leg —
-- which RLS rejects with:
--
--   new row violates row-level security policy (USING expression)
--
-- Symptom: "Generate data" fails on a system that already has readings, and
-- re-running the demo seed cannot top data up to today.
--
-- Fix: allow the system owner (or an admin) to update rows of systems they
-- can access — the same ownership rule the other policies use.

-- ── solar_readings ──────────────────────────────────────────────────────────

create policy "System owner can update solar readings"
  on public.solar_readings for update
  using (public.can_access_system(system_id))
  with check (public.can_access_system(system_id));

-- ── consumption_readings ────────────────────────────────────────────────────

create policy "System owner can update consumption readings"
  on public.consumption_readings for update
  using (public.can_access_system(system_id))
  with check (public.can_access_system(system_id));

-- ── battery_readings ────────────────────────────────────────────────────────

create policy "System owner can update battery readings"
  on public.battery_readings for update
  using (public.can_access_system(system_id))
  with check (public.can_access_system(system_id));

-- ── grid_readings ───────────────────────────────────────────────────────────

create policy "System owner can update grid readings"
  on public.grid_readings for update
  using (public.can_access_system(system_id))
  with check (public.can_access_system(system_id));

commit;
