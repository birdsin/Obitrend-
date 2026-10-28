-- OBITREND staging cleanup: optional, privacy-preserving location sharing.
-- Review and apply manually to the intended staging database only.
create table if not exists public.user_locations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lat numeric,
  lng numeric,
  approx_city text,
  shared_at timestamptz,
  is_sharing boolean not null default false,
  constraint user_locations_lat_range check (lat is null or lat between -90 and 90),
  constraint user_locations_lng_range check (lng is null or lng between -180 and 180)
);

alter table public.user_locations enable row level security;

drop policy if exists "Users read own location" on public.user_locations;
create policy "Users read own location"
  on public.user_locations for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users insert own location" on public.user_locations;
create policy "Users insert own location"
  on public.user_locations for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own location" on public.user_locations;
create policy "Users update own location"
  on public.user_locations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete own location" on public.user_locations;
create policy "Users delete own location"
  on public.user_locations for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.user_locations to authenticated;
