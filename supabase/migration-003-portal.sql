-- CULMERA platform, Phase 3 (steps 3.3 and 3.4): meeting booking rule + data export / deletion requests.
-- Run ONCE in the Supabase SQL Editor, after schema.sql and migration-002-platform.sql. Safe to run again (idempotent).
-- Nothing here deletes or changes existing data.

------------------------------------------------------------------ 3.3  one active meeting per brief
-- A client can hold only ONE meeting that is still "requested" or "confirmed" for a brief.
-- Rescheduling edits that row; cancelling frees the slot so a new meeting can be requested.
-- (If this fails with "could not create unique index", you have two active meetings on one brief:
--  cancel one of them in Table Editor > meetings, then run the script again.)
create unique index if not exists meetings_one_active_per_brief
  on public.meetings (brief_id) where status in ('requested','confirmed');

------------------------------------------------------------------ 3.4  data export / deletion requests
-- A client records a request here; the Founder handles it by hand (no automatic destructive action).
-- client_id becomes NULL if the account is later deleted, so the request history stays without personal data.
create table if not exists public.data_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(profile_id) on delete set null,
  kind text not null check (kind in ('export','deletion')),
  status text not null default 'open' check (status in ('open','in_progress','done','rejected')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
-- one pending request of each kind per client
create unique index if not exists data_requests_one_pending
  on public.data_requests (client_id, kind) where status in ('open','in_progress');
create index if not exists data_requests_status_idx on public.data_requests (status, created_at desc);

create or replace function private.guard_data_requests() returns trigger language plpgsql as $$
begin
  if private.server_ctx() then return new; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'open' or new.handled_at is not null then raise exception 'a new request must be open'; end if;
  else
    if new.id <> old.id or new.client_id is distinct from old.client_id or new.kind <> old.kind or new.created_at <> old.created_at then
      raise exception 'immutable column'; end if;
    if new.status <> old.status and new.status in ('done','rejected') then new.handled_at := coalesce(new.handled_at, now()); end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_data_requests on public.data_requests;
create trigger guard_data_requests before insert or update on public.data_requests
  for each row execute function private.guard_data_requests();
drop trigger if exists audit_data_requests on public.data_requests;
create trigger audit_data_requests after insert or update or delete on public.data_requests
  for each row execute function private.audit_row();

alter table public.data_requests enable row level security;
revoke all on public.data_requests from anon, authenticated;
grant select, insert, update on public.data_requests to authenticated;
grant all on public.data_requests to service_role;

drop policy if exists data_requests_select on public.data_requests;
drop policy if exists data_requests_insert on public.data_requests;
drop policy if exists data_requests_update on public.data_requests;
-- the client sees only their own requests; the Founder sees all; partners and directors see none
create policy data_requests_select on public.data_requests for select to authenticated
  using (private.me_role() = 'founder' or (private.me_role() = 'client' and client_id = auth.uid()));
create policy data_requests_insert on public.data_requests for insert to authenticated
  with check (private.me_role() = 'client' and client_id = auth.uid() and status = 'open');
-- only the Founder changes a request (status, handled_at)
create policy data_requests_update on public.data_requests for update to authenticated
  using (private.me_role() = 'founder') with check (private.me_role() = 'founder');
