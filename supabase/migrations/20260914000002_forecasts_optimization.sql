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
