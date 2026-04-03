create table if not exists public.leaderboard_entries (
  id uuid primary key,
  name text not null check (char_length(trim(name)) > 0),
  old_tariff_name text not null check (char_length(trim(old_tariff_name)) > 0),
  old_work_price_cents numeric not null check (old_work_price_cents >= 0),
  old_base_price_euro numeric not null check (old_base_price_euro >= 0),
  new_tariff_name text not null check (char_length(trim(new_tariff_name)) > 0),
  new_work_price_cents numeric not null check (new_work_price_cents >= 0),
  new_base_price_euro numeric not null check (new_base_price_euro >= 0),
  old_annual_cost numeric not null,
  new_annual_cost numeric not null,
  annual_savings numeric not null,
  created_at timestamptz not null default now()
);

alter table public.leaderboard_entries enable row level security;

drop policy if exists "leaderboard_entries_select_public" on public.leaderboard_entries;
create policy "leaderboard_entries_select_public"
on public.leaderboard_entries
for select
to anon
using (true);

drop policy if exists "leaderboard_entries_insert_public" on public.leaderboard_entries;
create policy "leaderboard_entries_insert_public"
on public.leaderboard_entries
for insert
to anon
with check (true);

alter publication supabase_realtime add table public.leaderboard_entries;
