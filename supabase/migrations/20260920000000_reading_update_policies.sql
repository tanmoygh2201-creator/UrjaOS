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
