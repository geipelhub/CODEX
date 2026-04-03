create table if not exists public.leaderboard_entries (
  id uuid primary key,
  name text not null check (char_length(trim(name)) > 0),
  old_tariff_name text not null check (char_length(trim(old_tariff_name)) > 0),
  old_tariff_type text not null default 'fixed' check (old_tariff_type in ('fixed', 'dynamic')),
  old_work_price_cents numeric not null check (old_work_price_cents >= 0),
  old_market_price_cents numeric,
  old_markup_cents numeric not null default 0 check (old_markup_cents >= 0),
  old_base_price_euro numeric not null check (old_base_price_euro >= 0),
  new_tariff_name text not null check (char_length(trim(new_tariff_name)) > 0),
  new_tariff_type text not null default 'fixed' check (new_tariff_type in ('fixed', 'dynamic')),
  new_work_price_cents numeric not null check (new_work_price_cents >= 0),
  new_market_price_cents numeric,
  new_markup_cents numeric not null default 0 check (new_markup_cents >= 0),
  new_base_price_euro numeric not null check (new_base_price_euro >= 0),
  old_annual_cost numeric not null,
  new_annual_cost numeric not null,
  annual_savings numeric not null,
  estimated boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.leaderboard_entries add column if not exists old_tariff_type text not null default 'fixed';
alter table public.leaderboard_entries add column if not exists old_market_price_cents numeric;
alter table public.leaderboard_entries add column if not exists old_markup_cents numeric not null default 0;
alter table public.leaderboard_entries add column if not exists new_tariff_type text not null default 'fixed';
alter table public.leaderboard_entries add column if not exists new_market_price_cents numeric;
alter table public.leaderboard_entries add column if not exists new_markup_cents numeric not null default 0;
alter table public.leaderboard_entries add column if not exists estimated boolean not null default false;

alter table public.leaderboard_entries enable row level security;

drop policy if exists "leaderboard_entries_select_public" on public.leaderboard_entries;
create policy "leaderboard_entries_select_public"
on public.leaderboard_entries
for select
to public
using (true);

drop policy if exists "leaderboard_entries_insert_public" on public.leaderboard_entries;
create policy "leaderboard_entries_insert_public"
on public.leaderboard_entries
for insert
to public
with check (true);

drop policy if exists "leaderboard_entries_delete_admin" on public.leaderboard_entries;
create policy "leaderboard_entries_delete_admin"
on public.leaderboard_entries
for delete
to authenticated
using ((auth.jwt() ->> 'email') = 'jaspergeipel@gmail.com');

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'leaderboard_entries'
  ) then
    alter publication supabase_realtime add table public.leaderboard_entries;
  end if;
end
$$;
