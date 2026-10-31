create table if not exists public.generated_image_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  tool_id text not null default 'fashion-creator',
  title text not null default 'Fashion creation',
  prompt text not null default '',
  settings jsonb not null default '{}'::jsonb,
  image_index integer not null default 0 check (image_index >= 0),
  created_at timestamptz not null default now()
);

create index if not exists generated_image_history_user_created_idx
  on public.generated_image_history (user_id, created_at desc);

alter table public.generated_image_history enable row level security;

drop policy if exists "Users can read their own generated image history"
  on public.generated_image_history;

create policy "Users can read their own generated image history"
  on public.generated_image_history
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.generated_image_history from anon, authenticated;
grant select on public.generated_image_history to authenticated;
grant all on public.generated_image_history to service_role;
