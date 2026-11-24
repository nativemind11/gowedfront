-- CULMERA platform, Phase 4 (partner portal and management consoles).
-- Run ONCE in the Supabase SQL Editor, after schema.sql, migration-002-platform.sql and migration-003-portal.sql.
-- Safe to run again (idempotent). Nothing here deletes or changes existing data.
--
-- 1. A deactivated partner or director loses access (not only the ability to bring new clients).
-- 2. The Partner Playbook lives in a table that only staff can read (behind login, not in the public site files).

------------------------------------------------------------------ 1. deactivated staff see nothing
-- me_role() is the single gate every policy uses. A partner or director whose partners.active is false now gets NULL,
-- exactly like a suspended user, so every policy denies them. Founder and clients are unaffected.
create or replace function private.me_role() returns text
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
   where p.id = auth.uid() and p.status = 'active'
     and (p.role in ('founder','client')
          or exists (select 1 from public.partners x where x.profile_id = p.id and x.active))
$$;

------------------------------------------------------------------ 2. Partner Playbook
create table if not exists public.playbook (
  key text primary key check (key ~ '^[a-z0-9-]{2,40}$'),
  sort int not null default 0,
  title text not null check (char_length(title) between 1 and 120),
  body jsonb not null default '[]'::jsonb check (octet_length(body::text) <= 50000),
  updated_at timestamptz not null default now()
);

create or replace function private.guard_playbook() returns trigger language plpgsql as $$
begin
  if private.server_ctx() then return new; end if;
  if new.key <> old.key then raise exception 'immutable column'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists guard_playbook on public.playbook;
create trigger guard_playbook before update on public.playbook for each row execute function private.guard_playbook();
drop trigger if exists audit_playbook on public.playbook;
create trigger audit_playbook after insert or update or delete on public.playbook for each row execute function private.audit_row();

alter table public.playbook enable row level security;
revoke all on public.playbook from anon, authenticated;
grant select, update on public.playbook to authenticated;
grant all on public.playbook to service_role;
drop policy if exists playbook_select on public.playbook;
drop policy if exists playbook_update on public.playbook;
-- every active staff role reads it; clients and visitors never; only the Founder edits
create policy playbook_select on public.playbook for select to authenticated
  using (private.me_role() in ('founder','director','partner'));
create policy playbook_update on public.playbook for update to authenticated
  using (private.me_role() = 'founder') with check (private.me_role() = 'founder');

------------------------------------------------------------------ Playbook content (English; the Founder can edit it in Table Editor > playbook)
-- Block types: h (heading), p (paragraph), ul (list: items), copy (text a partner may copy; {link} and {code} are filled in by the page).
-- Rules followed here: no prices, no named clients, no promised deadlines, no claims beyond the approved figures (1500+ projects, 45+ countries).
insert into public.playbook (key, sort, title, body) values
('about', 10, 'CULMERA in three sentences', $j$[
 {"t":"p","x":"CULMERA designs and builds websites, platforms and business systems around the way an organisation actually works."},
 {"t":"p","x":"One organised team carries the project from the first idea, through a clear written scope, to a dependable launch."},
 {"t":"p","x":"CULMERA is an international Dutch company headquartered in Dubai, United Arab Emirates, with branches in 15 countries and more than 5,000 employees worldwide. We have delivered 1500+ projects for clients in 45+ countries."}]$j$::jsonb),
('process', 20, 'How the process works', $j$[
 {"t":"ul","items":[
  "1. The client creates a free account and fills in a short brief (it saves automatically).",
  "2. The client books a free first call from their account.",
  "3. We scope the brief and send a clear written quote before any work starts.",
  "4. After the client agrees, we plan, build and launch together, and the client always sees where things stand.",
  "Your part: introduce the client with your link or code. The account is linked to you permanently, and you can follow each client's progress in your dashboard."]}]$j$::jsonb),
('packages', 30, 'Ready packages (no prices)', $j$[
 {"t":"p","x":"Use these as conversation starters. Every project is scoped from the client's own brief, and the client always receives a written quote before any work starts. Never quote a price."},
 {"t":"h","x":"Starter Store"},{"t":"p","x":"An online store with everything needed to start selling."},
 {"t":"h","x":"Brand Website"},{"t":"p","x":"A full company website that the client's own team can edit."},
 {"t":"h","x":"Service Business"},{"t":"p","x":"Online booking, a client list and payments connected in one flow."},
 {"t":"h","x":"Operations Suite"},{"t":"p","x":"Leads, clients, stock and the team working on one connected system."},
 {"t":"h","x":"Smart Assistant"},{"t":"p","x":"An assistant that answers and qualifies enquiries, with workflows that remove manual work."}]$j$::jsonb),
('pitch', 40, 'The 30-second pitch', $j$[
 {"t":"copy","x":"CULMERA is an organised team that designs and builds websites, platforms and business systems. You tell us what you want to achieve in a short brief, we talk it through in a free first call, and you get a clear written quote before any work starts. We have delivered 1500+ projects in 45+ countries."}]$j$::jsonb),
('templates', 50, 'Message templates', $j$[
 {"t":"h","x":"First message"},
 {"t":"copy","x":"Hello, I work with CULMERA, a team that builds websites, platforms and business systems. If you are planning something, you can start a short brief here and book a free first call: {link}"},
 {"t":"h","x":"Follow-up after a few days"},
 {"t":"copy","x":"Hello, a quick follow-up. If you would like to talk through your idea, the brief takes a few minutes and saves as you go: {link}. The first call is free, and you receive a clear written quote before any work starts."},
 {"t":"h","x":"Thank-you after the client signs up"},
 {"t":"copy","x":"Thank you for creating your account. The next step is the short brief, then you can book a free first call from your account. Tell me if you would like me to help with anything."}]$j$::jsonb),
('answers', 60, 'Approved answers to common questions', $j$[
 {"t":"h","x":"What does CULMERA do?"},{"t":"p","x":"We design and build websites, platforms and business systems, from one clear brief to a dependable launch."},
 {"t":"h","x":"How much does it cost?"},{"t":"p","x":"The first call is free. We scope your brief and send a clear written quote before any work starts, so you decide with the full picture."},
 {"t":"h","x":"How long will it take?"},{"t":"p","x":"It depends on the scope. The timing is set out in the written quote, after we have understood your brief."},
 {"t":"h","x":"Where are you based?"},{"t":"p","x":"Our headquarters is in Dubai, United Arab Emirates, with branches in 15 countries. We deliver our services online and have completed 1500+ projects for clients in 45+ countries."},
 {"t":"h","x":"Can I see examples of your work?"},{"t":"p","x":"We share what we are allowed to share once we have spoken. We never name a client without their permission."},
 {"t":"h","x":"Something I cannot answer"},{"t":"p","x":"Say you will check with the team and ask the client to book the free first call. Do not guess."}]$j$::jsonb),
('never', 70, 'Never say', $j$[
 {"t":"ul","items":[
  "Never give or hint at a price, a discount or a 'best price'.",
  "Never name a client, or say who we have worked for.",
  "Never promise a deadline or a delivery date.",
  "Never claim anything beyond the approved figures: 1500+ projects and 45+ countries.",
  "Never promise results such as sales, rankings or traffic.",
  "Never use another contact method for CULMERA than the official email, info@culmera-solutions.com.",
  "Never ask a client for a password or any secret."]}]$j$::jsonb)
on conflict (key) do nothing;
