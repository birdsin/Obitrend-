-- OBITREND production cleanup: opt-in location sharing.
-- This migration is source-only until deliberately applied to the intended Supabase project.
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

-- A signed-in user can only read and change their own location record.
drop policy if exists "Users can read own location" on public.user_locations;
create policy "Users can read own location"
  on public.user_locations for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own location" on public.user_locations;
create policy "Users can insert own location"
  on public.user_locations for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own location" on public.user_locations;
create policy "Users can update own location"
  on public.user_locations for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own location" on public.user_locations;
create policy "Users can delete own location"
  on public.user_locations for delete to authenticated
  using (auth.uid() = user_id);

-- No anon/public policy is created. Administrative access should use the
-- server-side service role behind an authenticated, authorization-checked admin API.
