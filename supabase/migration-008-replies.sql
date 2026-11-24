-- CULMERA platform, Phase 2 (new brief and reply flow): the Founder's replies, the client's answers, the Teams link, replies to visitors.
-- Run ONCE in the Supabase SQL Editor, after migration-007-roles.sql. Safe to run again (idempotent). It changes no existing data.
--
-- WHO SEES WHAT
--   Client   reads and writes (replies only) the messages of his own brief. Never the internal notes.
--   Founder  reads everything. His replies are written by the SERVER (api/reply.js, service key), not by the browser.
--   Partner and Director see NOTHING from this file: not the messages, not the price, not the Teams link.
--            (They have no policy on the new table, and the 007 views list their columns by name, so the new
--             meetings.teams_url column is not in them. The RLS test 10.1 proves it.)
--   Visitor  (public form, no account) gets the reply by email only. The reply is kept in visitor_replies (server only,
--            plus read access for the Founder).
-- The price lives ONLY in brief_messages.price_text / visitor_replies.price_text. It is never copied to briefs, meetings or any view.

------------------------------------------------------------------ 1. notify_events: two new kinds
-- brief_thanks = the thank-you email to a signed-in client, client_reply = "the client answered" notice for the Founder.
alter table public.notify_events drop constraint if exists notify_events_kind_check;
alter table public.notify_events add constraint notify_events_kind_check
  check (kind in ('registered','brief_submitted','meeting','brief_thanks','client_reply'));

------------------------------------------------------------------ 2. meetings: the Teams link
-- The Founder pastes it by hand when he confirms a call (the system never creates a link). https only, no spaces, bounded.
alter table public.meetings add column if not exists teams_url text;
alter table public.meetings drop constraint if exists meetings_teams_url_check;
alter table public.meetings add constraint meetings_teams_url_check
  check (teams_url is null or (char_length(teams_url) between 12 and 500 and teams_url ~ '^https://[^[:space:]]+$'));
alter table public.meetings drop constraint if exists meetings_teams_url_status;
alter table public.meetings add constraint meetings_teams_url_status
  check (teams_url is null or status in ('confirmed','done'));

-- guard_meetings: the rules of migration 002 stay exactly as they were, plus:
--   * a link is cleared by itself when the call goes back to requested or is cancelled (the client moved or cancelled it, or the Founder did);
--   * only the Founder / the server can put a link on a call; a client can neither write nor change it.
create or replace function private.guard_meetings() returns trigger language plpgsql as $$
begin
  if new.status in ('requested','cancelled') then new.teams_url := null; end if;
  if private.server_ctx() then return new; end if;
  if tg_op = 'UPDATE' and (new.client_id <> old.client_id or new.brief_id <> old.brief_id) then
    raise exception 'immutable column'; end if;
  if private.me_role() = 'client' then
    if new.status not in ('requested','cancelled') then raise exception 'clients may only request or cancel'; end if;
    if new.status = 'requested' and (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at)
       and new.starts_at < now() + interval '1 hour' then
      raise exception 'meeting must start at least one hour from now'; end if;
    if tg_op = 'UPDATE' and new.starts_at is distinct from old.starts_at then new.teams_url := null; end if;
  end if;
  if private.me_role() is distinct from 'founder' and new.teams_url is not null
     and (tg_op = 'INSERT' or new.teams_url is distinct from old.teams_url) then
    raise exception 'only the Founder sets the meeting link'; end if;
  return new;
end $$;

------------------------------------------------------------------ 3. brief_messages: the conversation on one brief
create table if not exists public.brief_messages (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.client_briefs(id) on delete cascade,
  client_id uuid not null references public.clients(profile_id) on delete cascade,
  sender text not null check (sender in ('founder','client')),
  kind text not null default 'reply' check (kind in ('reply','meeting_confirmed')),
  body text not null default '' check (char_length(body) <= 4000),
  price_text text check (price_text is null or char_length(price_text) between 1 and 120),
  proposes_meeting boolean not null default false,
  meeting_id uuid references public.meetings(id) on delete set null,   -- the call this message is about (client's chosen time, or the confirmed call)
  req_id uuid,                                                           -- one id per form submit: a double click cannot create two messages or two emails
  email_status text check (email_status is null or email_status in ('sending','sent','failed','skipped')),
  email_at timestamptz,
  created_at timestamptz not null default now(),
  constraint brief_messages_body_needed check (kind = 'meeting_confirmed' or char_length(body) >= 1),
  -- price, the meeting proposal and the confirmation are the Founder's; a client message is a plain reply (it may point at his own call)
  constraint brief_messages_founder_only check (sender = 'founder' or (price_text is null and not proposes_meeting and kind = 'reply' and email_status is null))
);
create index if not exists brief_messages_brief_idx on public.brief_messages (brief_id, created_at);
create index if not exists brief_messages_client_idx on public.brief_messages (client_id, created_at desc);
create unique index if not exists brief_messages_req_id_key on public.brief_messages (req_id) where req_id is not null;

create or replace function private.guard_brief_messages() returns trigger language plpgsql as $$
declare bc uuid; mm record; n int;
begin
  if tg_op = 'UPDATE' then
    -- append-only: the browser can never change a message; the server may only record the state of the email
    if not private.server_ctx() then raise exception 'messages are append-only'; end if;
    if new.id <> old.id or new.brief_id <> old.brief_id or new.client_id <> old.client_id or new.sender <> old.sender or new.kind <> old.kind
       or new.body <> old.body or new.price_text is distinct from old.price_text or new.proposes_meeting <> old.proposes_meeting
       or new.meeting_id is distinct from old.meeting_id or new.req_id is distinct from old.req_id or new.created_at <> old.created_at then
      raise exception 'immutable column'; end if;
    return new;
  end if;
  select client_id into bc from public.client_briefs where id = new.brief_id;
  if bc is null or bc <> new.client_id then raise exception 'message does not belong to this brief'; end if;
  if new.meeting_id is not null then
    select brief_id, client_id into mm from public.meetings where id = new.meeting_id;
    if mm.brief_id is distinct from new.brief_id or mm.client_id is distinct from new.client_id then raise exception 'meeting does not belong to this brief'; end if;
  end if;
  if private.server_ctx() then return new; end if;
  if private.me_role() = 'client' then
    -- at most 10 replies an hour per client
    select count(*) into n from public.brief_messages where client_id = new.client_id and sender = 'client' and created_at > now() - interval '1 hour';
    if n >= 10 then raise exception 'too many replies, try again later'; end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_brief_messages on public.brief_messages;
create trigger guard_brief_messages before insert or update on public.brief_messages
  for each row execute function private.guard_brief_messages();
drop trigger if exists audit_brief_messages on public.brief_messages;
create trigger audit_brief_messages after insert or update or delete on public.brief_messages
  for each row execute function private.audit_row();

alter table public.brief_messages enable row level security;
revoke all on public.brief_messages from anon, authenticated;
grant select, insert on public.brief_messages to authenticated;     -- no update, no delete from the browser
grant all on public.brief_messages to service_role;

drop policy if exists brief_messages_select on public.brief_messages;
drop policy if exists brief_messages_insert on public.brief_messages;
-- the Founder reads all; a client reads the messages of his own brief; a Partner or a Director reads none
create policy brief_messages_select on public.brief_messages for select to authenticated
  using (private.me_role() = 'founder' or (private.me_role() = 'client' and client_id = auth.uid()));
-- only a client writes from the browser, only as himself, only on his own OPEN brief, and only once the Founder has written first.
-- (The Founder's messages are written by the server.)
create policy brief_messages_insert on public.brief_messages for insert to authenticated
  with check (private.me_role() = 'client' and client_id = auth.uid() and sender = 'client'
              and exists (select 1 from public.client_briefs b where b.id = brief_id and b.client_id = auth.uid()
                          and b.status in ('submitted','in_review','scheduled','in_discussion'))
              and exists (select 1 from public.brief_messages f where f.brief_id = brief_messages.brief_id and f.sender = 'founder'));

------------------------------------------------------------------ 4. visitor_replies: replies to the PUBLIC form (no account, so by email)
create table if not exists public.visitor_replies (
  id uuid primary key default gen_random_uuid(),
  brief_ref text not null references public.briefs(ref) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  price_text text check (price_text is null or char_length(price_text) between 1 and 120),
  proposes_meeting boolean not null default false,
  req_id uuid,
  email_status text check (email_status is null or email_status in ('sending','sent','failed','skipped')),
  email_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists visitor_replies_ref_idx on public.visitor_replies (brief_ref, created_at);
create unique index if not exists visitor_replies_req_id_key on public.visitor_replies (req_id) where req_id is not null;

alter table public.visitor_replies enable row level security;
revoke all on public.visitor_replies from anon, authenticated;
grant select on public.visitor_replies to authenticated;            -- read only, and only the Founder gets rows (policy below)
grant all on public.visitor_replies to service_role;
drop policy if exists visitor_replies_select on public.visitor_replies;
create policy visitor_replies_select on public.visitor_replies for select to authenticated using (private.me_role() = 'founder');

-- The Founder's console lists the public briefs (they were server-only until now). Founder read access only: no other role gets a row.
grant select on public.briefs to authenticated;
drop policy if exists briefs_founder_select on public.briefs;
create policy briefs_founder_select on public.briefs for select to authenticated using (private.me_role() = 'founder');

------------------------------------------------------------------ check (run by hand after the migration, as the SQL editor user)
-- select policyname, cmd from pg_policies where schemaname = 'public' and tablename in ('brief_messages','visitor_replies','briefs') order by 1;
-- select column_name from information_schema.columns where table_schema = 'public' and table_name = 'director_meetings' order by 1;   -- no teams_url
