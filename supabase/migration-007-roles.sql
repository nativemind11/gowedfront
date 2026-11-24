-- CULMERA platform, Phase 9 / step 1: what a Partner and a Director may see and do.
-- Run ONCE in the Supabase SQL Editor, after migration-006-languages.sql. Safe to run again (idempotent).
-- Nothing here deletes or changes existing data.
--
-- PARTNER sees only:   the names of his clients, how many he has, the project (selected services) each client asked for, the Playbook.
--                      Never the client's email, phone, company, country, the brief answers, status, calls or notes.
-- DIRECTOR sees only:  the names of the partners in his group, each partner's clients, the project each client asked for,
--                      each client's brief (status and answers), the calls (status and time), the Playbook. READ ONLY.
--                      Never the client's email, phone, company, country, private call notes or internal notes.
-- FOUNDER:             everything, and is the only one who changes briefs, calls, partners, invitations.
--
-- How: the base tables (clients, client_briefs, meetings, notes, partners, profiles, invitations) are readable only by the
-- Founder and by the client himself. Partners and Directors read through the views below, which return only the columns above
-- and only the rows of their own clients. The views run with the owner's rights on purpose (that is what lets them show a
-- client's name without opening the client's table) and every one of them checks the caller's role in its WHERE clause.

------------------------------------------------------------------ 1. who sees which client
-- The old staff rule (partner: own clients; director: own clients and the clients of partners in his group). Used ONLY by the views.
create or replace function private.staff_sees_client(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(case private.me_role()
    when 'partner'  then exists (select 1 from public.clients c where c.profile_id = cid and c.partner_id = auth.uid())
    when 'director' then exists (select 1 from public.clients c left join public.partners p on p.profile_id = c.partner_id
                                  where c.profile_id = cid and (c.partner_id = auth.uid() or p.director_id = auth.uid()))
    else false end, false)
$$;

-- The rule every base-table policy uses: the Founder, or the client himself. Staff go through the views.
create or replace function private.can_see_client(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(case private.me_role()
    when 'founder' then true
    when 'client'  then cid = auth.uid()
    else false end, false)
$$;

-- Profiles: the Founder sees all; everybody sees his own. A client's name and email are no longer readable by staff here.
create or replace function private.can_see_profile(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.me_role() = 'founder' or (private.me_role() is not null and pid = auth.uid()), false)
$$;

grant execute on function private.staff_sees_client(uuid), private.can_see_client(uuid), private.can_see_profile(uuid)
  to authenticated, service_role;

------------------------------------------------------------------ 2. base-table policies (no staff write access except the Founder)
-- partners: Founder, or the person's own row (his code). A Director no longer reads or changes his partners' rows directly.
drop policy if exists partners_select on public.partners;
drop policy if exists partners_update on public.partners;
create policy partners_select on public.partners for select to authenticated
  using (private.me_role() = 'founder' or (profile_id = auth.uid() and private.me_role() is not null));
create policy partners_update on public.partners for update to authenticated
  using (private.me_role() = 'founder') with check (private.me_role() = 'founder');

-- client_briefs: the Director can no longer change a brief (status or anything else)
drop policy if exists briefs_update on public.client_briefs;
create policy briefs_update on public.client_briefs for update to authenticated
  using (private.me_role() = 'founder'
         or (private.me_role() = 'client' and client_id = auth.uid() and status in ('draft','submitted')))
  with check (private.me_role() = 'founder'
         or (private.me_role() = 'client' and client_id = auth.uid() and status in ('draft','submitted')));

-- meetings: the Director can no longer confirm, finish or cancel a call
drop policy if exists meetings_update on public.meetings;
create policy meetings_update on public.meetings for update to authenticated
  using (private.me_role() = 'founder'
         or (private.me_role() = 'client' and client_id = auth.uid() and status in ('requested','confirmed')))
  with check (private.me_role() = 'founder'
         or (private.me_role() = 'client' and client_id = auth.uid()));

-- notes: internal notes are for the Founder only now
drop policy if exists notes_select on public.notes;
drop policy if exists notes_insert on public.notes;
create policy notes_select on public.notes for select to authenticated
  using (private.me_role() = 'founder');
create policy notes_insert on public.notes for insert to authenticated
  with check (private.me_role() = 'founder' and author_id = auth.uid()
              and (brief_id is null or exists (select 1 from public.client_briefs b where b.id = brief_id and b.client_id = notes.client_id)));

-- invitations: Founder only (a Director no longer invites partners)
drop policy if exists invitations_select on public.invitations;
drop policy if exists invitations_insert on public.invitations;
create policy invitations_select on public.invitations for select to authenticated
  using (private.me_role() = 'founder');
create policy invitations_insert on public.invitations for insert to authenticated
  with check (invited_by = auth.uid() and private.me_role() = 'founder');

-- clients, client_briefs (select / insert), meetings (select / insert), profiles: their policies call can_see_client /
-- can_see_profile, which now mean "Founder or the client himself". No policy text needs to change.

------------------------------------------------------------------ 3. read-only views for Partner and Director
-- PARTNER: name + project of each of his clients. Draft briefs are not shown (a project is "requested" once the brief is sent).
create or replace view public.partner_clients as
  select c.profile_id,
         pr.full_name,
         c.created_at,
         coalesce((select b.selected_types from public.client_briefs b
                    where b.client_id = c.profile_id and b.status <> 'draft'
                    order by b.updated_at desc limit 1), '{}'::text[]) as selected_types
    from public.clients c
    join public.profiles pr on pr.id = c.profile_id
   where private.me_role() = 'partner' and c.partner_id = auth.uid();

-- DIRECTOR: his partners (the group)
create or replace view public.director_team as
  select pa.profile_id, pr.full_name, pa.director_id, pa.active, pr.created_at
    from public.partners pa
    join public.profiles pr on pr.id = pa.profile_id
   where private.me_role() = 'director' and pa.director_id = auth.uid();

-- DIRECTOR: the clients of his partners and his own direct clients (name only, no contact details)
create or replace view public.director_clients as
  select c.profile_id, c.partner_id, pr.full_name, c.created_at
    from public.clients c
    join public.profiles pr on pr.id = c.profile_id
   where private.me_role() = 'director' and private.staff_sees_client(c.profile_id);

-- DIRECTOR: briefs of those clients, with the answers (read only)
create or replace view public.director_briefs as
  select b.id, b.ref, b.client_id, b.status, b.selected_types, b.answers, b.locale, b.created_at, b.updated_at, b.submitted_at
    from public.client_briefs b
   where private.me_role() = 'director' and private.staff_sees_client(b.client_id);

-- DIRECTOR: calls of those clients (status and time; the client's private note to the team is not included)
create or replace view public.director_meetings as
  select m.id, m.brief_id, m.client_id, m.starts_at, m.timezone, m.duration_min, m.status
    from public.meetings m
   where private.me_role() = 'director' and private.staff_sees_client(m.client_id);

revoke all on public.partner_clients, public.director_team, public.director_clients, public.director_briefs, public.director_meetings
  from public, anon, authenticated;
grant select on public.partner_clients, public.director_team, public.director_clients, public.director_briefs, public.director_meetings
  to authenticated;
grant all on public.partner_clients, public.director_team, public.director_clients, public.director_briefs, public.director_meetings
  to service_role;

------------------------------------------------------------------ check (run by hand after the migration, as the SQL editor user)
-- select policyname, cmd from pg_policies where schemaname = 'public' and tablename in ('notes','invitations','partners') order by 1;
-- select table_name from information_schema.views where table_schema = 'public' and table_name in
--   ('partner_clients','director_team','director_clients','director_briefs','director_meetings');
