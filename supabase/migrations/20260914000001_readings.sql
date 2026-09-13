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
