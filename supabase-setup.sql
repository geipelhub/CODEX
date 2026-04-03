create extension if not exists pgcrypto;

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

create table if not exists public.leaderboard_admin_settings (
  key text primary key,
  password_hash text not null
);

insert into public.leaderboard_admin_settings (key, password_hash)
values (
  'default',
  crypt('Wechselcafe-Admin-2026', gen_salt('bf'))
)
on conflict (key) do update
set password_hash = excluded.password_hash;

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

create or replace function public.verify_leaderboard_admin_password(admin_password_input text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  stored_hash text;
begin
  select password_hash
  into stored_hash
  from public.leaderboard_admin_settings
  where key = 'default';

  if stored_hash is null then
    return false;
  end if;

  return stored_hash = crypt(admin_password_input, stored_hash);
end;
$$;

grant execute on function public.verify_leaderboard_admin_password(text) to anon, authenticated;

create or replace function public.delete_leaderboard_entry_with_password(
  entry_id_input uuid,
  admin_password_input text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.verify_leaderboard_admin_password(admin_password_input) then
    raise exception 'invalid_admin_password';
  end if;

  delete from public.leaderboard_entries
  where id = entry_id_input;
end;
$$;

grant execute on function public.delete_leaderboard_entry_with_password(uuid, text) to anon, authenticated;

create or replace function public.clear_leaderboard_with_password(admin_password_input text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.verify_leaderboard_admin_password(admin_password_input) then
    raise exception 'invalid_admin_password';
  end if;

  delete from public.leaderboard_entries;
end;
$$;

grant execute on function public.clear_leaderboard_with_password(text) to anon, authenticated;

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
