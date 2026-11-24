-- CULMERA platform: "client project status" (حالة طلب العميل) and the partner's / director's amount.
-- Run ONCE in the Supabase SQL Editor, after migration-008-replies.sql. Safe to run again (idempotent).
-- It changes no existing data. Existing clients simply have no row yet (= stage "pending").
--
-- WHAT IT DOES
--   The Founder sets, for each client: the stage of the project (pending / building / delivered) and, once it is
--   delivered, an amount in US dollars (the money that goes to the Partner's Director).
--
-- WHO SEES WHAT
--   Founder   reads and writes everything in public.client_projects.
--   Client    sees NOTHING from this table (the amount is not his business). No policy, no grant.
--   Partner   sees (through public.partner_clients) the stage of HIS clients, and the amount only when stage = 'delivered'.
--   Director  sees (through public.director_clients) the stage of his clients (his partners' clients and his direct ones),
--             and the amount only when stage = 'delivered'. READ ONLY.
--   Nobody except the Founder can write: the browser has no insert / update / delete policy for anyone else.

------------------------------------------------------------------ 1. table
create table if not exists public.client_projects (
  profile_id uuid primary key references public.clients(profile_id) on delete cascade,
  stage text not null default 'pending',
  amount_usd numeric(12,2),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null
);
alter table public.client_projects drop constraint if exists client_projects_stage_check;
alter table public.client_projects add constraint client_projects_stage_check
  check (stage in ('pending','building','delivered'));
alter table public.client_projects drop constraint if exists client_projects_amount_check;
alter table public.client_projects add constraint client_projects_amount_check
  check (amount_usd is null or (amount_usd >= 0 and amount_usd <= 100000000));
-- an amount only exists on a delivered project (moving it back to pending / building clears the amount)
alter table public.client_projects drop constraint if exists client_projects_amount_stage;
alter table public.client_projects add constraint client_projects_amount_stage
  check (amount_usd is null or stage = 'delivered');

create or replace function private.touch_client_projects() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := coalesce(auth.uid(), new.updated_by); return new; end $$;
drop trigger if exists touch_client_projects on public.client_projects;
create trigger touch_client_projects before insert or update on public.client_projects
  for each row execute function private.touch_client_projects();

-- audit: who changed what (column NAMES only, never the amount itself)
drop trigger if exists audit_client_projects on public.client_projects;
create trigger audit_client_projects after insert or update or delete on public.client_projects
  for each row execute function private.audit_row();

------------------------------------------------------------------ 2. Row Level Security: Founder only
alter table public.client_projects enable row level security;
drop policy if exists client_projects_select on public.client_projects;
drop policy if exists client_projects_insert on public.client_projects;
drop policy if exists client_projects_update on public.client_projects;
drop policy if exists client_projects_delete on public.client_projects;
create policy client_projects_select on public.client_projects for select to authenticated
  using (private.me_role() = 'founder');
create policy client_projects_insert on public.client_projects for insert to authenticated
  with check (private.me_role() = 'founder');
create policy client_projects_update on public.client_projects for update to authenticated
  using (private.me_role() = 'founder') with check (private.me_role() = 'founder');
create policy client_projects_delete on public.client_projects for delete to authenticated
  using (private.me_role() = 'founder');

revoke all on public.client_projects from public, anon, authenticated;
grant select, insert, update, delete on public.client_projects to authenticated;   -- the policies above decide
grant all on public.client_projects to service_role;

------------------------------------------------------------------ 3. the two read-only views get two NEW columns at the END
-- (create or replace view keeps the old columns exactly as they were; the old front end keeps working)
-- project_stage: 'pending' when the Founder has not set anything yet.
-- amount_usd:    only when the stage is 'delivered', otherwise NULL.
create or replace view public.partner_clients as
  select c.profile_id,
         pr.full_name,
         c.created_at,
         coalesce((select b.selected_types from public.client_briefs b
                    where b.client_id = c.profile_id and b.status <> 'draft'
                    order by b.updated_at desc limit 1), '{}'::text[]) as selected_types,
         coalesce(cp.stage, 'pending') as project_stage,
         case when cp.stage = 'delivered' then cp.amount_usd end as amount_usd
    from public.clients c
    join public.profiles pr on pr.id = c.profile_id
    left join public.client_projects cp on cp.profile_id = c.profile_id
   where private.me_role() = 'partner' and c.partner_id = auth.uid();

create or replace view public.director_clients as
  select c.profile_id, c.partner_id, pr.full_name, c.created_at,
         coalesce(cp.stage, 'pending') as project_stage,
         case when cp.stage = 'delivered' then cp.amount_usd end as amount_usd
    from public.clients c
    join public.profiles pr on pr.id = c.profile_id
    left join public.client_projects cp on cp.profile_id = c.profile_id
   where private.me_role() = 'director' and private.staff_sees_client(c.profile_id);

revoke all on public.partner_clients, public.director_clients from public, anon, authenticated;
grant select on public.partner_clients, public.director_clients to authenticated;
grant all on public.partner_clients, public.director_clients to service_role;

------------------------------------------------------------------ check (run by hand after the migration, as the SQL editor user)
-- select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'client_projects' order by 1;
-- select column_name from information_schema.columns where table_schema = 'public' and table_name in ('partner_clients','director_clients') order by 1;
