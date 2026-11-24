-- CULMERA back-end schema. FRESH database: run this file once in the Supabase SQL Editor.
-- (An EXISTING older database should run migration-001.sql instead. Both end in the same state.)
create extension if not exists pgcrypto;

create table if not exists public.briefs (
  id uuid primary key default gen_random_uuid(),
  ref text not null,
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  company text not null,
  country text not null,
  timezone text,
  items_count int not null default 1,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  notify jsonb,
  constraint briefs_ref_key unique (ref),
  constraint briefs_ref_format check (ref ~ '^BR-[A-Z0-9]{6}$'),
  constraint briefs_name_len check (char_length(name) between 2 and 120),
  constraint briefs_email_len check (char_length(email) <= 200),
  constraint briefs_company_len check (char_length(company) <= 160),
  constraint briefs_country_len check (char_length(country) <= 100),
  constraint briefs_timezone_len check (timezone is null or char_length(timezone) <= 64),
  -- 0 is allowed: a visitor who is "not sure yet" can ask for a discovery conversation without choosing types
  constraint briefs_items_count_range check (items_count between 0 and 20),
  constraint briefs_payload_size check (octet_length(payload::text) <= 100000),
  constraint briefs_status_valid check (status in ('new','scheduled','in_discussion','won','lost','spam'))
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  ref text not null,
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  message text not null,
  status text not null default 'new',
  notify jsonb,
  constraint contacts_ref_key unique (ref),
  constraint contacts_ref_format check (ref ~ '^CT-[A-Z0-9]{6}$'),
  constraint contacts_name_len check (char_length(name) between 2 and 120),
  constraint contacts_email_len check (char_length(email) <= 200),
  constraint contacts_message_len check (char_length(message) between 1 and 4000),
  constraint contacts_status_valid check (status in ('new','replied','spam'))
);

create index if not exists briefs_created_at_idx on public.briefs (created_at desc);
create index if not exists briefs_status_created_idx on public.briefs (status, created_at desc);
create index if not exists contacts_created_at_idx on public.contacts (created_at desc);
create index if not exists contacts_status_created_idx on public.contacts (status, created_at desc);

alter table public.briefs enable row level security;
alter table public.contacts enable row level security;
-- No policies on purpose: only the service role (back-end) can read or write.
revoke all on public.briefs, public.contacts from anon, authenticated;
grant all on public.briefs, public.contacts to service_role;
