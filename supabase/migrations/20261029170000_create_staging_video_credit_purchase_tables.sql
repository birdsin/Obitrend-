-- Staging-only schema for secure video-credit purchases and wallet balances.
-- API routes use the Supabase service role; browser roles receive no direct access.

create table if not exists public.video_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reference text not null unique,
  duration_seconds integer not null check (duration_seconds in (5, 10, 15, 20)),
  amount integer not null check (amount in (500000, 800000, 1000000, 1500000, 1600000, 2000000)),
  currency text not null default 'NGN' check (currency = 'NGN'),
  credits integer not null default 1 check (credits = 1),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.video_credit_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now(),
  balance_5 integer not null default 0 check (balance_5 >= 0),
  balance_10 integer not null default 0 check (balance_10 >= 0),
  balance_15 integer not null default 0 check (balance_15 >= 0),
  balance_20 integer not null default 0 check (balance_20 >= 0)
);

create index if not exists video_credit_purchases_user_created_idx
  on public.video_credit_purchases (user_id, created_at desc);
create index if not exists video_credit_purchases_status_idx
  on public.video_credit_purchases (status, created_at desc);

alter table public.video_credit_purchases enable row level security;
alter table public.video_credit_wallets enable row level security;

revoke all on public.video_credit_purchases from anon, authenticated;
revoke all on public.video_credit_wallets from anon, authenticated;
grant all on public.video_credit_purchases to service_role;
grant all on public.video_credit_wallets to service_role;
