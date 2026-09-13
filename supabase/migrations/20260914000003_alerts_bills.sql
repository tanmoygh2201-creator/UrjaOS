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
