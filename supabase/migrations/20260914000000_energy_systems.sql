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

-- Ownership check for all tables that reference energy_systems.
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

revoke all on function public.is_admin() from anon;
revoke all on function public.can_access_system(uuid) from anon;

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
