-- CULMERA platform: company announcements (a small notice shown to every visitor, top right of the site).
-- Run ONCE in the Supabase SQL Editor, after migration-009-project-status.sql. Safe to run again (idempotent).
-- It changes no existing data.
--
-- WHO CAN DO WHAT
--   Everybody (visitors too)  reads ONLY the announcements that are live right now (starts_at <= now() < expires_at).
--   Founder                   reads every announcement (also the expired ones), creates, edits and deletes them.
--   Nobody else can write.    The browser has no insert / update / delete policy for any other role.

------------------------------------------------------------------ 1. table
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 600),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- a notice lives between 1 hour and 365 days
  constraint announcements_window check (expires_at > starts_at + interval '1 hour' and expires_at <= starts_at + interval '365 days')
);
create index if not exists announcements_live_idx on public.announcements (expires_at);

-- audit: who published or removed what (column NAMES only)
drop trigger if exists audit_announcements on public.announcements;
create trigger audit_announcements after insert or update or delete on public.announcements
  for each row execute function private.audit_row();

------------------------------------------------------------------ 2. Row Level Security
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;
grant all on public.announcements to service_role;

drop policy if exists announcements_select_live on public.announcements;
drop policy if exists announcements_select_founder on public.announcements;
drop policy if exists announcements_insert on public.announcements;
drop policy if exists announcements_update on public.announcements;
drop policy if exists announcements_delete on public.announcements;

-- everyone: only what is live now
create policy announcements_select_live on public.announcements for select to anon, authenticated
  using (starts_at <= now() and expires_at > now());
-- Founder: everything, including expired ones
create policy announcements_select_founder on public.announcements for select to authenticated
  using (private.me_role() = 'founder');
create policy announcements_insert on public.announcements for insert to authenticated
  with check (private.me_role() = 'founder');
create policy announcements_update on public.announcements for update to authenticated
  using (private.me_role() = 'founder') with check (private.me_role() = 'founder');
create policy announcements_delete on public.announcements for delete to authenticated
  using (private.me_role() = 'founder');

------------------------------------------------------------------ check (run by hand after the migration)
-- select policyname, cmd, roles from pg_policies where schemaname = 'public' and tablename = 'announcements' order by 1;
