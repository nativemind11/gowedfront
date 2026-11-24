-- CULMERA migration 001. Safe to run more than once, on a FRESH or an EXISTING older database.
-- Brings every table, column, constraint, status list and index in line with api/brief.js.
-- Existing rows are never deleted or rewritten. New constraints are added NOT VALID first and then
-- validated; if old rows violate one, a NOTICE is printed and only new rows are checked.
create extension if not exists pgcrypto;

-- 1. tables (no-ops when they already exist)
create table if not exists public.briefs (
  id uuid primary key default gen_random_uuid(),
  ref text not null,
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  company text not null,
  country text not null
);
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  ref text not null,
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  message text not null
);

-- 2. columns that older databases may be missing
alter table public.briefs add column if not exists created_at timestamptz not null default now();
alter table public.briefs add column if not exists timezone text;
alter table public.briefs add column if not exists items_count int not null default 1;
alter table public.briefs add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.briefs add column if not exists status text not null default 'new';
alter table public.briefs add column if not exists notify jsonb;
alter table public.contacts add column if not exists created_at timestamptz not null default now();
alter table public.contacts add column if not exists status text not null default 'new';
alter table public.contacts add column if not exists notify jsonb;

-- 3. unique references (an existing unique constraint/index on ref satisfies this)
do $$ begin
  if not exists (select 1 from pg_indexes where schemaname='public' and tablename='briefs' and indexdef ilike '%unique%(ref)%') then
    create unique index briefs_ref_key on public.briefs (ref); end if;
  if not exists (select 1 from pg_indexes where schemaname='public' and tablename='contacts' and indexdef ilike '%unique%(ref)%') then
    create unique index contacts_ref_key on public.contacts (ref); end if;
end $$;

-- 4. constraints: drop the older auto-named ones that conflict, add the named ones
do $$
declare r record; o text;
begin
  for r in select * from (values
    ('briefs','briefs_ref_format','ref ~ ''^BR-[A-Z0-9]{6}$''', array['briefs_ref_check']),
    ('briefs','briefs_name_len','char_length(name) between 2 and 120', array['briefs_name_check']),
    ('briefs','briefs_email_len','char_length(email) <= 200', array['briefs_email_check']),
    ('briefs','briefs_company_len','char_length(company) <= 160', array['briefs_company_check']),
    ('briefs','briefs_country_len','char_length(country) <= 100', array['briefs_country_check']),
    ('briefs','briefs_timezone_len','timezone is null or char_length(timezone) <= 64', array['briefs_timezone_check']),
    ('briefs','briefs_items_count_range','items_count between 0 and 20', array['briefs_items_count_check']),
    ('briefs','briefs_payload_size','octet_length(payload::text) <= 100000', array['briefs_payload_check']),
    ('briefs','briefs_status_valid','status in (''new'',''scheduled'',''in_discussion'',''won'',''lost'',''spam'')', array['briefs_status_check','briefs_status_check2']),
    ('contacts','contacts_ref_format','ref ~ ''^CT-[A-Z0-9]{6}$''', array['contacts_ref_check']),
    ('contacts','contacts_name_len','char_length(name) between 2 and 120', array['contacts_name_check']),
    ('contacts','contacts_email_len','char_length(email) <= 200', array['contacts_email_check']),
    ('contacts','contacts_message_len','char_length(message) between 1 and 4000', array['contacts_message_check']),
    ('contacts','contacts_status_valid','status in (''new'',''replied'',''spam'')', array['contacts_status_check'])
  ) as t(tbl, cname, expr, olds)
  loop
    foreach o in array r.olds loop
      execute format('alter table public.%I drop constraint if exists %I', r.tbl, o);
    end loop;
    if not exists (select 1 from pg_constraint where conrelid = format('public.%I', r.tbl)::regclass and conname = r.cname) then
      execute format('alter table public.%I add constraint %I check (%s) not valid', r.tbl, r.cname, r.expr);
    end if;
    begin
      execute format('alter table public.%I validate constraint %I', r.tbl, r.cname);
    exception when check_violation then
      raise notice 'Existing rows break %.%; it is enforced for new rows only. Review those rows.', r.tbl, r.cname;
    end;
  end loop;
end $$;

-- 5. indexes for the owner's day-to-day views (newest first, by status)
create index if not exists briefs_created_at_idx on public.briefs (created_at desc);
create index if not exists briefs_status_created_idx on public.briefs (status, created_at desc);
create index if not exists contacts_created_at_idx on public.contacts (created_at desc);
create index if not exists contacts_status_created_idx on public.contacts (status, created_at desc);

-- 6. access: service role only
alter table public.briefs enable row level security;
alter table public.contacts enable row level security;
revoke all on public.briefs, public.contacts from anon, authenticated;
grant all on public.briefs, public.contacts to service_role;
