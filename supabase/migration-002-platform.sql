-- CULMERA platform schema (Phase 2): accounts, partner groups, briefs, meetings, notes, invitations, audit log.
-- Run ONCE in the Supabase SQL Editor, after schema.sql. Safe to run again (idempotent).
-- Security model: Row Level Security on every table, default deny. The browser uses only the publishable key.
-- NOTE: the public website form keeps using public.briefs / public.contacts (service key only).
--       Platform briefs live in public.client_briefs so the two never collide.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

------------------------------------------------------------------ tables
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'client' check (role in ('founder','director','partner','client')),
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text not null check (char_length(email) <= 200),
  locale text not null default 'en' check (locale in ('en','ar','de','zh','fr','ru')),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now()
);

create table if not exists public.partners (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9-]{3,20}$'),
  director_id uuid references public.profiles(id) on delete set null,
  active boolean not null default true
);

create table if not exists public.clients (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  partner_id uuid references public.profiles(id) on delete set null,   -- NULL = direct client (owned by the Founder)
  code_used text check (code_used is null or char_length(code_used) <= 40),
  company text not null default '' check (char_length(company) <= 160),
  country text not null default '' check (char_length(country) <= 100),
  phone text check (phone is null or char_length(phone) <= 40),
  created_at timestamptz not null default now()
);

create table if not exists public.client_briefs (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('CB-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  client_id uuid not null references public.clients(profile_id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','submitted','in_review','scheduled','in_discussion','won','lost','archived')),
  answers jsonb not null default '{}'::jsonb check (octet_length(answers::text) <= 200000),
  selected_types text[] not null default '{}' check (cardinality(selected_types) <= 77),
  locale text not null default 'en' check (locale in ('en','ar','de','zh','fr','ru')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.client_briefs(id) on delete cascade,
  client_id uuid not null references public.clients(profile_id) on delete cascade,
  starts_at timestamptz not null,
  timezone text not null check (char_length(timezone) <= 64),
  duration_min int not null default 30 check (duration_min between 15 and 240),
  status text not null default 'requested' check (status in ('requested','confirmed','done','cancelled')),
  note text check (note is null or char_length(note) <= 1000)
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(profile_id) on delete cascade,
  brief_id uuid references public.client_briefs(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) <= 200),
  role text not null check (role in ('director','partner')),
  invited_by uuid not null default auth.uid() references public.profiles(id),
  director_id uuid references public.profiles(id),        -- group for a partner; NULL for a director or a direct partner
  token_hash text not null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  table_name text not null,
  row_id text,
  changed text[]            -- column NAMES only, never values: no personal data in the log
);

create index if not exists partners_director_idx on public.partners (director_id);
create index if not exists clients_partner_idx on public.clients (partner_id);
create index if not exists client_briefs_client_idx on public.client_briefs (client_id);
create index if not exists meetings_client_idx on public.meetings (client_id);
create index if not exists notes_client_idx on public.notes (client_id, created_at desc);
create index if not exists invitations_email_idx on public.invitations (lower(email));
create unique index if not exists invitations_one_pending on public.invitations (lower(email)) where accepted_at is null;
create index if not exists audit_log_at_idx on public.audit_log (at desc);

------------------------------------------------------------------ helper functions
-- True for the SQL editor, the server (service key) and Supabase internals; false for browser users.
create or replace function private.server_ctx() returns boolean
language sql stable as $$ select current_user in ('postgres','service_role','supabase_admin','supabase_auth_admin') $$;

-- The caller's role, or NULL when not signed in or suspended (a suspended user sees nothing).
create or replace function private.me_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and status = 'active'
$$;

create or replace function private.can_see_client(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(case private.me_role()
    when 'founder' then true
    when 'client' then cid = auth.uid()
    when 'partner' then exists (select 1 from public.clients c where c.profile_id = cid and c.partner_id = auth.uid())
    when 'director' then exists (select 1 from public.clients c left join public.partners p on p.profile_id = c.partner_id
                                 where c.profile_id = cid and (c.partner_id = auth.uid() or p.director_id = auth.uid()))
    else false end, false)
$$;

create or replace function private.in_my_group(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.me_role() = 'director'
     and exists (select 1 from public.partners p where p.profile_id = pid and p.director_id = auth.uid())
$$;

create or replace function private.can_see_profile(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.me_role() = 'founder'
    or (private.me_role() is not null and pid = auth.uid())
    or (private.me_role() in ('partner','director')
        and exists (select 1 from public.clients c where c.profile_id = pid) and private.can_see_client(pid))
    or private.in_my_group(pid), false)
$$;

create or replace function private.new_code() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare c text;
begin
  loop
    c := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    exit when not exists (select 1 from public.partners where code = c);
  end loop;
  return c;
end $$;

------------------------------------------------------------------ account creation (the ONLY way a profile is born)
-- Role never comes from user-supplied metadata. It comes from a pending invitation, otherwise it is "client".
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare md jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
        inv public.invitations%rowtype; v_code text; v_partner uuid; v_loc text; v_name text; v_mail text;
begin
  v_mail := lower(btrim(coalesce(new.email, '')));
  v_loc  := case when md->>'locale' in ('en','ar','de','zh','fr','ru') then md->>'locale' else 'en' end;
  v_name := left(btrim(coalesce(md->>'full_name', '')), 120);
  select * into inv from public.invitations
   where lower(email) = v_mail and accepted_at is null and expires_at > now()
   order by created_at desc limit 1;
  if found then
    insert into public.profiles (id, role, full_name, email, locale) values (new.id, inv.role, v_name, v_mail, v_loc);
    insert into public.partners (profile_id, code, director_id)
      values (new.id, private.new_code(), case when inv.role = 'partner' then inv.director_id end);
    update public.invitations set accepted_at = now() where id = inv.id;
  else
    insert into public.profiles (id, role, full_name, email, locale) values (new.id, 'client', v_name, v_mail, v_loc);
    v_code := upper(btrim(left(coalesce(md->>'partner_code', ''), 40)));
    select p.profile_id into v_partner from public.partners p join public.profiles pr on pr.id = p.profile_id
     where p.code = v_code and p.active and pr.status = 'active' and pr.role in ('partner','director');
    insert into public.clients (profile_id, partner_id, code_used, company, country, phone)
      values (new.id, v_partner, nullif(v_code, ''), left(btrim(coalesce(md->>'company','')),160),
              left(btrim(coalesce(md->>'country','')),100), nullif(left(btrim(coalesce(md->>'phone','')),40),''));
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- One-time Founder creation, run by the owner in the SQL Editor (not callable from the browser).
create or replace function private.bootstrap_founder(p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  update public.profiles set role = 'founder' where lower(email) = lower(btrim(p_email)) returning id into v_id;
  if v_id is null then raise exception 'No account with that email. Create the user first (Authentication > Users).'; end if;
  delete from public.clients where profile_id = v_id;
  return 'Founder set: ' || v_id::text;
end $$;
revoke all on function private.bootstrap_founder(text) from public, anon, authenticated;

------------------------------------------------------------------ guard triggers (what each role may NOT change)
create or replace function private.guard_profiles() returns trigger language plpgsql as $$
begin
  if private.server_ctx() then return new; end if;
  if new.id <> old.id or new.email <> old.email or new.created_at <> old.created_at then
    raise exception 'immutable column'; end if;
  if new.role <> old.role and (old.id = auth.uid() or private.me_role() <> 'founder') then
    raise exception 'role change not allowed'; end if;
  if new.status <> old.status and (old.id = auth.uid() or private.me_role() <> 'founder') then
    raise exception 'status change not allowed'; end if;
  return new;
end $$;

create or replace function private.guard_partners() returns trigger language plpgsql as $$
begin
  if private.server_ctx() then return new; end if;
  if new.profile_id <> old.profile_id or new.code <> old.code then raise exception 'immutable column'; end if;
  if new.director_id is distinct from old.director_id and private.me_role() <> 'founder' then
    raise exception 'only the Founder moves a partner between groups'; end if;
  return new;
end $$;

create or replace function private.guard_clients() returns trigger language plpgsql as $$
begin
  if private.server_ctx() then return new; end if;
  if new.profile_id <> old.profile_id or new.created_at <> old.created_at then raise exception 'immutable column'; end if;
  if (new.partner_id is distinct from old.partner_id or new.code_used is distinct from old.code_used)
     and private.me_role() <> 'founder' then raise exception 'only the Founder reassigns a client'; end if;
  return new;
end $$;

create or replace function private.guard_client_briefs() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.status = 'submitted' and old.status <> 'submitted' then new.submitted_at := now(); end if;
    new.updated_at := now();
  end if;
  if private.server_ctx() then return new; end if;
  if tg_op = 'UPDATE' and (new.client_id <> old.client_id or new.ref <> old.ref or new.created_at <> old.created_at) then
    raise exception 'immutable column'; end if;
  if private.me_role() = 'client' and tg_op = 'UPDATE' then
    if new.status <> old.status and not (old.status = 'draft' and new.status = 'submitted') then
      raise exception 'clients may only move a brief from draft to submitted'; end if;
  end if;
  return new;
end $$;

create or replace function private.guard_meetings() returns trigger language plpgsql as $$
begin
  if private.server_ctx() then return new; end if;
  if tg_op = 'UPDATE' and (new.client_id <> old.client_id or new.brief_id <> old.brief_id) then
    raise exception 'immutable column'; end if;
  if private.me_role() = 'client' then
    if new.status not in ('requested','cancelled') then raise exception 'clients may only request or cancel'; end if;
    if new.status = 'requested' and (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at)
       and new.starts_at < now() + interval '1 hour' then
      raise exception 'meeting must start at least one hour from now'; end if;
  end if;
  return new;
end $$;

create or replace function private.immutable_audit() returns trigger language plpgsql as $$
begin raise exception 'audit_log is append-only'; end $$;

-- audit: who did what to which row. Column NAMES only.
create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare jn jsonb; jo jsonb; ch text[]; rid text;
begin
  if tg_op = 'DELETE' then jo := to_jsonb(old); rid := coalesce(jo->>'id', jo->>'profile_id');
  else
    jn := to_jsonb(new); rid := coalesce(jn->>'id', jn->>'profile_id');
    if tg_op = 'UPDATE' then
      jo := to_jsonb(old);
      select coalesce(array_agg(t.k order by t.k), '{}') into ch
        from jsonb_object_keys(jn) as t(k) where jn->t.k is distinct from jo->t.k and t.k <> 'updated_at';
      if cardinality(ch) = 0 then return null; end if;
      if tg_argv[0] = 'status_only' and not ('status' = any(ch)) then return null; end if;
    end if;
  end if;
  insert into public.audit_log (actor, action, table_name, row_id, changed) values (auth.uid(), lower(tg_op), tg_table_name, rid, ch);
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['profiles','partners','clients','client_briefs','meetings'] loop
    execute format('drop trigger if exists guard_%1$s on public.%1$s', t);
  end loop;
end $$;
create trigger guard_profiles before update on public.profiles for each row execute function private.guard_profiles();
create trigger guard_partners before update on public.partners for each row execute function private.guard_partners();
create trigger guard_clients before update on public.clients for each row execute function private.guard_clients();
create trigger guard_client_briefs before insert or update on public.client_briefs for each row execute function private.guard_client_briefs();
create trigger guard_meetings before insert or update on public.meetings for each row execute function private.guard_meetings();

drop trigger if exists audit_log_immutable on public.audit_log;
create trigger audit_log_immutable before update or delete on public.audit_log for each row execute function private.immutable_audit();

do $$ declare t text; begin
  foreach t in array array['profiles','partners','clients','notes','invitations'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function private.audit_row()', t);
  end loop;
  foreach t in array array['client_briefs','meetings'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function private.audit_row(''status_only'')', t);
  end loop;
end $$;

------------------------------------------------------------------ Row Level Security
alter table public.profiles enable row level security;
alter table public.partners enable row level security;
alter table public.clients enable row level security;
alter table public.client_briefs enable row level security;
alter table public.meetings enable row level security;
alter table public.notes enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.profiles, public.partners, public.clients, public.client_briefs, public.meetings,
              public.notes, public.invitations, public.audit_log from anon, authenticated;
grant select, update on public.profiles, public.partners, public.clients to authenticated;
grant select, insert, update on public.client_briefs, public.meetings to authenticated;
grant select, insert on public.notes, public.invitations to authenticated;
grant select on public.audit_log to authenticated;
grant all on public.profiles, public.partners, public.clients, public.client_briefs, public.meetings,
            public.notes, public.invitations, public.audit_log to service_role;
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on function private.bootstrap_founder(text) from authenticated;

do $$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public' and tablename in ('profiles','partners','clients','client_briefs','meetings','notes','invitations','audit_log') loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- profiles
create policy profiles_select on public.profiles for select to authenticated using (private.can_see_profile(id));
create policy profiles_update on public.profiles for update to authenticated
  using (private.me_role() = 'founder' or (id = auth.uid() and private.me_role() is not null))
  with check (private.me_role() = 'founder' or (id = auth.uid() and private.me_role() is not null));

-- partners
create policy partners_select on public.partners for select to authenticated
  using (private.me_role() = 'founder' or (profile_id = auth.uid() and private.me_role() is not null) or private.in_my_group(profile_id));
create policy partners_update on public.partners for update to authenticated
  using (private.me_role() = 'founder' or private.in_my_group(profile_id))
  with check (private.me_role() = 'founder' or private.in_my_group(profile_id));

-- clients
create policy clients_select on public.clients for select to authenticated using (private.can_see_client(profile_id));
create policy clients_update on public.clients for update to authenticated
  using (private.me_role() = 'founder' or (private.me_role() = 'client' and profile_id = auth.uid()))
  with check (private.me_role() = 'founder' or (private.me_role() = 'client' and profile_id = auth.uid()));

-- client_briefs
create policy briefs_select on public.client_briefs for select to authenticated using (private.can_see_client(client_id));
create policy briefs_insert on public.client_briefs for insert to authenticated
  with check (private.me_role() = 'client' and client_id = auth.uid() and status = 'draft');
create policy briefs_update on public.client_briefs for update to authenticated
  using (private.me_role() = 'founder'
         or (private.me_role() = 'client' and client_id = auth.uid() and status in ('draft','submitted'))
         or (private.me_role() = 'director' and private.can_see_client(client_id)))
  with check (private.me_role() = 'founder'
         or (private.me_role() = 'client' and client_id = auth.uid() and status in ('draft','submitted'))
         or (private.me_role() = 'director' and private.can_see_client(client_id)));

-- meetings
create policy meetings_select on public.meetings for select to authenticated using (private.can_see_client(client_id));
create policy meetings_insert on public.meetings for insert to authenticated
  with check (private.me_role() = 'client' and client_id = auth.uid()
              and exists (select 1 from public.client_briefs b where b.id = brief_id and b.client_id = auth.uid()));
create policy meetings_update on public.meetings for update to authenticated
  using (private.me_role() = 'founder'
         or (private.me_role() = 'client' and client_id = auth.uid() and status in ('requested','confirmed'))
         or (private.me_role() = 'director' and private.can_see_client(client_id)))
  with check (private.me_role() = 'founder'
         or (private.me_role() = 'client' and client_id = auth.uid())
         or (private.me_role() = 'director' and private.can_see_client(client_id)));

-- notes: staff only, never the client; append-only for browser users
create policy notes_select on public.notes for select to authenticated
  using (private.me_role() in ('founder','director','partner') and private.can_see_client(client_id));
create policy notes_insert on public.notes for insert to authenticated
  with check (private.me_role() in ('founder','director','partner') and private.can_see_client(client_id)
              and author_id = auth.uid()
              and (brief_id is null or exists (select 1 from public.client_briefs b where b.id = brief_id and b.client_id = notes.client_id)));

-- invitations: Founder invites anyone; a Director invites partners into their own group only
create policy invitations_select on public.invitations for select to authenticated
  using (private.me_role() = 'founder' or (private.me_role() = 'director' and invited_by = auth.uid()));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (invited_by = auth.uid() and (
    private.me_role() = 'founder'
    or (private.me_role() = 'director' and role = 'partner' and director_id = auth.uid())));

-- audit_log: Founder reads; nobody writes from the browser (rows come from triggers)
create policy audit_select on public.audit_log for select to authenticated using (private.me_role() = 'founder');
